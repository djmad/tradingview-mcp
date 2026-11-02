import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { batchMarkdown, writeBatchReports } from '../screener/output.js';

const scan = {
  generated_at: '2026-11-02T12:00:00.000Z', universe: { as_of: null, source_pr_published_on: '2026-09-06', source_revision: '3768597ed07f4925c0574b9faf4cd95a2efd59eb', source: 'https://github.com/tradesdontlie/tradingview-mcp/pull/511', revision: 'abc' },
  page: { offset: 0, processed: 1, total: 951 }, total_scanned: 1, total_matches: 1, total_errors: 0,
  elapsed_seconds: 1, total_skipped_illiquid: 0, min_avg_value_trx_50d: 1e9,
  outcomes: [{ symbol: 'IDX:BBCA', requested_symbol: 'IDX:BBCA', actual_symbol: 'IDX_DLY:BBCA', delay_seconds: 600, data_asof: 1700000000 }],
  results: [{ symbol: 'IDX:BBCA', actual_symbol: 'IDX_DLY:BBCA', delay_seconds: 600, data_asof: 1700000000, latest_loaded_bar_may_be_incomplete: true, last_close: 100, matches: [{ criterion: 'confirmed_uptrend', plan: { buy_area: '99 - 100', cutloss: 95, take_profit_1: 110, take_profit_2: 120, method: '=HYPERLINK("https://example.invalid")' } }] }],
};

it('labels batch scope, actual data timestamps and the dated unverified universe in Markdown', () => {
  const markdown = batchMarkdown(scan);
  assert.match(markdown, /batch only/); assert.match(markdown, /2026-09-06/);
  assert.match(markdown, /current membership verified: false/); assert.match(markdown, /1700000000/);
});

it('creates unique exclusive JSON/Markdown/XLSX reports and keeps worksheet strings literal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ihsg-reports-'));
  try {
    const first = await writeBatchReports(scan, { directory });
    const second = await writeBatchReports(scan, { directory });
    assert.equal(first.success, true); assert.equal(second.success, true);
    assert.notEqual(first.files.xlsx, second.files.xlsx);
    assert.equal(JSON.parse(await readFile(first.files.json, 'utf8')).page.total, 951);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(first.files.xlsx);
    const cell = workbook.getWorksheet('Sinyal').getCell('K2');
    assert.equal(typeof cell.value, 'string'); assert.match(cell.value, /^=HYPERLINK/);
    assert.equal(cell.formula, undefined);
    const rows = workbook.getWorksheet('Ringkasan').getSheetValues().filter(Boolean);
    assert.ok(rows.some(row => row[1] === 'Current Membership Verified' && row[2] === false));
    assert.ok(rows.some(row => row[1] === 'Report Scope' && row[2].startsWith('batch_only')));
    assert.ok(rows.some(row => row[1] === 'Source Revision' && row[2] === scan.universe.source_revision));
    assert.equal(workbook.getWorksheet('Sinyal').getCell('L2').value, new Date(1700000000 * 1000).toISOString());
    assert.equal(workbook.getWorksheet('Sinyal').getCell('M2').value, true);
    assert.equal(workbook.getWorksheet('Sinyal').getCell('N2').value, 'IDX_DLY:BBCA');
    assert.equal(workbook.getWorksheet('Sinyal').getCell('O2').value, 600);
    assert.ok(rows.some(row => row[1] === 'Observed Feed / Delay Seconds' && row[2].includes('IDX_DLY:BBCA / 600')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
