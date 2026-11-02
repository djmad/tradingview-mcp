// Explicit opt-in: one IDX symbol on the disposable temp layout. No blind recovery writes.
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttp } from '../src/server.js';
import { captureViewport } from '../src/core/viewport.js';
import { disconnect, evaluate, selectTarget } from '../src/connection.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const receiptPath = resolve(root, '.local/ihsg-smoke-results.json');
const reportRoot = resolve(root, '.local/ihsg');
const keys = ['MCP_PERM_MODE', 'MCP_PERM_DISABLED', 'MCP_AUDIT_LOG'];
const priorEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
process.env.MCP_PERM_MODE = 'rw';
delete process.env.MCP_PERM_DISABLED;
process.env.MCP_AUDIT_LOG = 'false';

let running;
let client;
let before;
let after;
let failure;
let scanSummary;
let scanAttempted = false;
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };

async function snapshot() {
  const viewport = await captureViewport({ timeout_ms: 5000 });
  const state = await evaluate(`(() => {
    const chart = window.TradingViewApi._activeChartWidgetWV.value();
    return { name: window.TradingViewApi._chartWidgetCollection.metaInfo.name.value(),
      symbol: chart.symbolExt().full_name, resolution: chart.resolution(), chart_type: chart.chartType(),
      studies: chart.getAllStudies(), shapes: chart.getAllShapes(), visible_range: chart.getVisibleRange() };
  })()`, { timeoutMs: 3000 });
  assert.equal(state.symbol, viewport.symbol, 'Chart changed during smoke snapshot');
  assert.equal(state.resolution, viewport.resolution, 'Timeframe changed during smoke snapshot');
  assert.deepEqual(state.visible_range, viewport.visible_range, 'Viewport changed during smoke snapshot');
  return { ...state, viewport };
}

async function call(name, args = {}, { inspectError = false } = {}) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.find(item => item.type === 'text')?.text;
  assert.equal(typeof text, 'string', `${name} did not return an inspectable text receipt`);
  const value = JSON.parse(text);
  if (!inspectError) assert.equal(Boolean(response.isError), false, `${name} returned an MCP error; inspect the ignored receipt`);
  return value;
}

function summary(scan) {
  return {
    success: scan.success, partial: scan.partial, halt_reason: scan.halt_reason,
    total_scanned: scan.total_scanned, total_matches: scan.total_matches, total_errors: scan.total_errors,
    page: scan.page, universe: scan.universe, chart_restoration: scan.chart_restoration,
    outcomes: scan.outcomes?.map(item => ({ symbol: item.symbol, requested_symbol: item.requested_symbol, actual_symbol: item.actual_symbol, actual_resolution: item.actual_resolution, delay_seconds: item.delay_seconds, delayed: item.delayed, bar_count: item.bar_count, data_asof: item.data_asof,
      skipped: item.skipped, reason: item.reason, latest_loaded_bar_may_be_incomplete: item.latest_loaded_bar_may_be_incomplete })),
    errors: scan.errors, error: scan.error, reports: scan.reports,
  };
}

async function verifyReports(scan) {
  assert.equal(scan.reports?.success, true, 'The single-batch report export failed');
  assert.equal(scan.reports.scope, 'batch_only', 'Reports must not claim a full-universe aggregate');
  const files = scan.reports.files;
  for (const [type, extension] of [['json', '.json'], ['markdown', '.md'], ['xlsx', '.xlsx']]) {
    const file = resolve(files?.[type] || '');
    const within = relative(reportRoot, file);
    assert.ok(within && !within.startsWith('..') && !isAbsolute(within), 'Report path escaped the project-local ignored output directory');
    assert.equal(extname(file).toLowerCase(), extension, 'Unexpected report extension');
    const info = await stat(file);
    assert.ok(info.isFile() && info.size > 0, 'Report file is missing or empty');
  }
  const json = JSON.parse(await readFile(files.json, 'utf8'));
  assert.equal(json.page.total, 1, 'This smoke request is one explicit symbol, not a full-universe run');
  assert.equal(json.page.processed, 1);
  assert.equal(json.page.done, true);
  assert.equal(json.universe.current_membership_verified, false);
  assert.equal(json.universe.as_of, null, 'PR publication must not be presented as a membership date');
  assert.match(json.universe.source_revision, /^[0-9a-f]{40}$/);
  const markdown = await readFile(files.markdown, 'utf8');
  assert.match(markdown, /this batch only/i);
  assert.match(markdown, /membership as-of: unknown/i);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(files.xlsx);
  assert.ok(workbook.getWorksheet('Sinyal'), 'Signal worksheet is missing');
  const rows = workbook.getWorksheet('Ringkasan')?.getSheetValues().filter(Boolean);
  assert.ok(rows?.some(row => row[1] === 'Report Scope' && String(row[2]).startsWith('batch_only')), 'Workbook batch scope is missing');
  assert.ok(rows.some(row => row[1] === 'Current Membership Verified' && row[2] === false), 'Workbook freshness limit is missing');
  assert.ok(rows.some(row => row[1] === 'Source Revision' && row[2] === json.universe.source_revision), 'Workbook source revision is missing');
  pass('exclusive batch JSON/Markdown/XLSX artifacts and provenance');
}

try {
  running = await startHttp({ host: '127.0.0.1', port: 0, tui: false, transport: 'mcp' });
  client = new Client({ name: 'ihsg-single-symbol-smoke', version: '2.2.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.httpServer.address().port}/mcp`)));
  const targets = await call('target_list');
  const targetId = process.env.MCP_SMOKE_TARGET_ID || process.env.TV_CDP_TARGET_ID
    || (targets.targets?.length === 1 ? targets.targets[0].id : null);
  assert.ok(targetId, 'Multiple charts require an explicit MCP_SMOKE_TARGET_ID; no target was guessed');
  const selected = await call('target_select', { target_id: targetId });
  assert.equal(selected.success, true, 'MCP target selection failed');
  await selectTarget(targetId); // Pin the read-only baseline client to the same target.
  before = await snapshot();
  assert.equal(before.name, 'temp', 'IHSG smoke requires the disposable layout named temp');
  pass('explicit target and complete disposable-layout baseline');

  scanAttempted = true;
  const scan = await call('IHSG_Screen', { symbols: ['IDX:BBCA'], limit: 1, timeout_ms: 20000, export_reports: true }, { inspectError: true });
  scanSummary = summary(scan);
  assert.equal(scan.success, true, 'IHSG_Screen did not verify successful scan and restoration');
  assert.equal(scan.partial, false, 'The one-symbol scan was partial');
  assert.equal(scan.total_errors, 0, 'The one-symbol scan reported an error');
  assert.equal(scan.total_scanned, 1, 'No daily instrument data was analyzed');
  assert.equal(scan.page.processed, 1);
  assert.equal(scan.page.done, true);
  assert.equal(scan.outcomes?.length, 1);
  const outcome = scan.outcomes[0];
  assert.equal(outcome.symbol, 'IDX:BBCA', 'Screening result came from an unexpected instrument');
  assert.equal(outcome.requested_symbol, 'IDX:BBCA');
  assert.ok(['IDX:BBCA', 'IDX_DLY:BBCA'].includes(outcome.actual_symbol), 'Unproven feed alias was returned');
  assert.ok(['D', '1D'].includes(outcome.actual_resolution), 'Unexpected native resolution');
  if (outcome.actual_symbol === 'IDX_DLY:BBCA') {
    assert.equal(outcome.delayed, true);
    assert.ok(Number.isFinite(outcome.delay_seconds) && outcome.delay_seconds > 0, 'Delayed-feed metadata is missing');
  }
  assert.equal(outcome.timeframe, 'D', 'The screener did not use daily data');
  assert.ok(outcome.bar_count >= 60, 'The smoke did not obtain enough daily bars to exercise the detectors');
  assert.ok(Number.isFinite(outcome.data_asof), 'Actual daily-bar timestamp was not disclosed');
  assert.ok(outcome.skipped === false || outcome.reason === 'illiquid', 'An unexplained or insufficient-data skip is not a scanner proof');
  assert.equal(scan.chart_restoration?.verified, true, 'The screener did not confirm chart restoration');
  pass('one-symbol daily scan with explicit liquidity/no-signal handling');
  await verifyReports(scan);
  after = await snapshot();
  assert.deepEqual(after, before, 'Final chart/layout/viewport/studies/shapes differ from the original baseline');
  pass('exact original chart and future-whitespace viewport restored');
} catch (error) { failure = error; }
finally {
  // A pending/unknown scan or external change is not permission for a blind recovery write.
  if (before && !after) {
    try { after = await snapshot(); } catch { /* Failed read remains explicitly unavailable below. */ }
  }
  const errors = [];
  try { await client?.close(); } catch { errors.push('MCP client cleanup failed'); }
  try { await running?.shutdown(); } catch { errors.push('MCP HTTP cleanup failed'); }
  try { await disconnect(); } catch { errors.push('Read-only CDP cleanup failed'); }
  if (!failure && errors.length) failure = new Error(errors.join('; '));
  try {
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, JSON.stringify({ success: !failure, scan_attempted: scanAttempted,
      before, after: after || null, scan: scanSummary || null, checks, recovery_writes_dispatched: false,
      error: failure?.message || null, cleanup_errors: errors }, null, 2), { mode: 0o600 });
  } finally {
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
if (failure) throw failure;
