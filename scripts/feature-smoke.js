// Explicit, disposable-layout integration proof. No watchlist writes, trades, alerts or Pine saves.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { captureViewport, restoreViewport } from '../src/core/viewport.js';
import { allTools } from '../src/permissions.js';
import { startHttp } from '../src/server.js';
import { selectTarget, disconnect } from '../src/connection.js';

const replayRequested = process.argv.includes('--replay');
const auditRequested = process.argv.includes('--audit');
const historyOption = process.argv.find(value => value.startsWith('--history-timeframe='));
const historyFlag = process.argv.indexOf('--history-timeframe');
const historyTimeframe = historyOption?.split('=')[1] || (historyFlag >= 0 ? process.argv[historyFlag + 1] : null);
if (historyTimeframe && !/^(?:[1-9][0-9]{0,3}|D|W|M|1D|1W|1M)$/.test(historyTimeframe)) throw new Error('Invalid explicit history smoke timeframe');
if (historyFlag >= 0 && !historyTimeframe) throw new Error('--history-timeframe requires a timeframe');
const originalEnvironment = Object.fromEntries(['MCP_PERM_MODE', 'MCP_PERM_DISABLED', 'MCP_AUDIT_LOG', 'MCP_AUDIT_LOG_PATH'].map(key => [key, process.env[key]]));
process.env.MCP_PERM_MODE = 'rw';
delete process.env.MCP_PERM_DISABLED;
process.env.MCP_AUDIT_LOG = auditRequested ? 'true' : 'false';
process.env.MCP_AUDIT_LOG_PATH = resolve('.local/audit/feature-smoke.jsonl');
const receipts = [];
const snapshot = async () => {
  // The viewport and cleanup state are captured atomically in the same bounded
  // readiness probe, including transient null layouts after replay chart reload.
  const { chart_state, ...viewport } = await captureViewport({ timeout_ms: 5000, include_chart_state: true });
  return { ...chart_state, viewport };
};
const identity = state => ({ name: state.name, symbol: state.symbol, resolution: state.resolution,
  chartType: state.chartType, studies: state.studies, shapes: state.shapes, visible_range: state.visible_range });
const running = await startHttp({ host: '127.0.0.1', port: 0, tui: false, transport: 'mcp' });
const client = new Client({ name: 'approved-feature-smoke', version: '2.2.0' });
let before;
let volume;
let savedStyle;
let styleWriteAttempted = false;
let replayAttempted = false;
let failure;
async function call(name, args = {}, { allowFalse = false } = {}) {
  const response = await client.callTool({ name, arguments: args });
  const value = JSON.parse(response.content.find(c => c.type === 'text').text);
  receipts.push({ tool: name, success: value.success, status: value.status });
  assert.ok(!response.isError && (allowFalse || value.success !== false), `${name}: ${JSON.stringify(value)}`);
  console.log(`PASS ${name}`);
  return value;
}
try {
  const endpoint = new URL(`http://127.0.0.1:${running.httpServer.address().port}/mcp`);
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const targets = await call('target_list');
  const id = process.env.MCP_SMOKE_TARGET_ID || process.env.TV_CDP_TARGET_ID || (targets.targets.length === 1 ? targets.targets[0].id : null);
  assert.ok(id, 'Multiple charts require MCP_SMOKE_TARGET_ID; this test never guesses a target');
  await call('target_select', { target_id: id });
  await selectTarget(id); // Match the read-only baseline/cleanup client to the same target.
  before = await snapshot();
  assert.equal(before.name, 'temp', 'Feature smoke requires the disposable layout named temp');
  const tools = await client.listTools();
  assert.equal(tools.tools.length, allTools().length);
  assert.ok(tools.tools.find(t => t.name === 'replay').inputSchema.properties.timestamp);
  await call('tv_health_check');
  volume = before.studies.find(study => /volume/i.test(study.name));
  assert.ok(volume, 'An existing Volume study is required; this test never adds a study');
  savedStyle = (await call('indicator_get_style', { entity_id: volume.id })).style;
  const width = savedStyle?.styles?.vol?.linewidth;
  assert.ok(Number.isInteger(width), 'Exact Volume linewidth must be discoverable');
  styleWriteAttempted = true;
  await call('indicator_set_style', { entity_id: volume.id, overrides: JSON.stringify({ 'styles.vol.linewidth': width === 2 ? 1 : 2 }) });
  await call('indicator_set_style', { entity_id: volume.id, overrides: JSON.stringify({ 'styles.vol.linewidth': width }) });
  assert.deepEqual((await call('indicator_get_style', { entity_id: volume.id })).style, savedStyle);
  styleWriteAttempted = false;

  if (historyTimeframe) await call('chart_set', { timeframe: historyTimeframe });
  const historyBefore = await snapshot();
  const history = await call('data_load_history', {
    count: Math.min(100000, historyBefore.loaded_count + 1), page_size: 50, max_iterations: 1, timeout_ms: 8000,
  }, { allowFalse: true });
  assert.equal(history.verification_complete, true, 'Pending history cannot be called a successful final-state proof');
  assert.equal(history.view_preserved, true);
  assert.ok(['reached', 'exhausted', 'iteration_limit'].includes(history.status));
  assert.deepEqual(identity(await snapshot()), identity(historyBefore));
  console.log(`History proof: status=${history.status}, loaded=${history.loaded_before}->${history.loaded_after}, requests=${history.iterations}`);
  if (historyTimeframe) {
    await call('chart_set', { timeframe: before.resolution });
    const expected = await captureViewport();
    const restored = await restoreViewport({ snapshot: before.viewport, expected_current: expected });
    assert.equal(restored.verified, true, restored.error);
  }

  // The currently visible watchlist may be inspected, never edited. A closed panel is an explicit skip.
  try {
    const groups = await call('watchlist_get_sections');
    console.log(`PASS watchlist sections read (${groups.sections.length} sections; contents omitted)`);
  } catch (error) {
    if (/Active custom watchlist unavailable/.test(error.message)) console.log('SKIP watchlist read: panel closed; no account changes made');
    else throw error;
  }
  if (replayRequested) {
    assert.ok(Number.isFinite(before.last_bar_time));
    replayAttempted = true;
    await call('replay', { action: 'start', timestamp: before.last_bar_time });
    await call('replay', { action: 'stop' });
    replayAttempted = false;
    const status = await call('replay', { action: 'status' });
    assert.equal(status.is_replay_started, false);
    assert.equal(status.current_date, null);
  } else console.log('SKIP replay start/stop: pass --replay to opt in');
} catch (error) { failure = error; }
finally {
  if (replayAttempted) await call('replay', { action: 'stop' }).catch(error => { failure ||= error; });
  if (styleWriteAttempted && volume && savedStyle) {
    await call('indicator_set_style', { entity_id: volume.id, overrides: JSON.stringify({ 'styles.vol.linewidth': savedStyle.styles.vol.linewidth }) }).catch(error => { failure ||= error; });
  }
  if (before?.name === 'temp') {
    let after = await snapshot().catch(error => { failure ||= error; });
    if (after && (after.symbol !== before.symbol || after.resolution !== before.resolution)) {
      await call('chart_set', { symbol: before.symbol, timeframe: before.resolution }).catch(error => { failure ||= error; });
      after = await snapshot().catch(error => { failure ||= error; });
    }
    if (after && after.symbol === before.symbol && after.resolution === before.resolution) {
      try {
        const expected = await captureViewport();
        const restored = await restoreViewport({ snapshot: before.viewport, expected_current: expected });
        assert.equal(restored.verified, true, restored.error);
      } catch (error) { failure ||= error; }
      after = await snapshot().catch(error => { failure ||= error; });
    }
    try {
      assert.deepEqual(identity(after), identity(before));
      if (savedStyle) assert.deepEqual((await call('indicator_get_style', { entity_id: volume.id })).style, savedStyle);
      console.log('PASS original chart, viewport and Volume style restored');
    } catch (error) { failure ||= error; }
  }
  mkdirSync('.local', { recursive: true });
  writeFileSync('.local/feature-smoke-results.json', JSON.stringify({ receipts, replay_requested: replayRequested, audit_requested: auditRequested, history_timeframe: historyTimeframe,
    restored: !failure, error: failure?.message }, null, 2));
  await client.close();
  await running.shutdown();
  await disconnect();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
if (failure) throw failure;
