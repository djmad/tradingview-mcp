import { it } from 'node:test';
import assert from 'node:assert/strict';
import { ihsgScreen, screenOptions } from '../src/core/ihsg.js';
import { registerIhsgTools } from '../src/tools/ihsg.js';

const clone = value => structuredClone(value);
const original = { symbol: 'INDEX:BTCUSD', series_full_name: 'INDEX:BTCUSD', series_symbols: ['INDEX:BTCUSD'], loading: false, resolution: '1M', chart_type: 1, studies: [{ id: 'volume-id', name: 'Volume' }], shapes: [], visible_range: { from: 100, to: 1900000000 }, bars_range: { from: 100, to: 1900000000 } };
const data = Array.from({ length: 80 }, (_, i) => ({ time: 1700000000 + i * 86400, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1e8 }));
function harness({ onSelect, onBars, onRestore, now } = {}) {
  let state = clone(original); const calls = [];
  const driver = {
    snapshot: async () => clone(state),
    select: async (symbol, resolution, expected) => {
      calls.push(['select', symbol]);
      if (onSelect) await onSelect(symbol);
      assert.deepEqual(state, expected);
      state = { ...state, symbol, resolution, visible_range: { from: 200, to: 300 }, bars_range: { from: 200, to: 300 } };
      return clone(state);
    },
    bars: async expected => {
      calls.push(['bars', expected.symbol]);
      if (onBars) await onBars(expected.symbol, next => { state = next; });
      return data;
    },
    restore: async (before, expected) => { calls.push(['restore']); assert.deepEqual(state, expected); state = clone(before); if (onRestore) onRestore(state); return clone(state); },
  };
  return { args: { symbols: ['IDX:BBCA', 'IDX:BBRI'], export_reports: false, _deps: { driver, now } }, calls, get state() { return state; } };
}

it('screens only the bounded batch and resumes the same universe/options with an opaque cursor', async () => {
  const h = harness();
  const first = await ihsgScreen({ ...h.args, limit: 1 });
  assert.equal(first.success, true); assert.equal(first.page.processed, 1); assert.equal(first.page.done, false);
  assert.equal(first.outcomes[0].symbol, 'IDX:BBCA'); assert.ok(first.page.next_cursor);
  const second = await ihsgScreen({ ...h.args, cursor: first.page.next_cursor, limit: 1 });
  assert.equal(second.outcomes[0].symbol, 'IDX:BBRI'); assert.equal(second.page.done, true); assert.equal(second.page.next_cursor, null);
  assert.deepEqual(h.state, original);
  await assert.rejects(ihsgScreen({ ...h.args, cursor: first.page.next_cursor, min_avg_value_trx_50d: 0 }), /Cursor does not match/);
});

it('preserves exact future-whitespace viewport in the restoration contract', async () => {
  const h = harness(); const result = await ihsgScreen(h.args);
  assert.equal(result.chart_restoration.verified, true);
  assert.deepEqual(h.state, original);
  assert.equal(h.state.visible_range.to, 1900000000);
});

it('reports per-symbol read errors and restores the confirmed owned chart state', async () => {
  const h = harness({ onBars: async symbol => { if (symbol === 'IDX:BBCA') throw new Error('read failed'); } });
  const result = await ihsgScreen(h.args);
  assert.equal(result.success, false); assert.equal(result.partial, true); assert.equal(result.total_errors, 1);
  assert.equal(result.page.processed, 2); assert.equal(result.chart_restoration.verified, true);
  assert.deepEqual(h.state, original);
});

it('does not retry an uncertain chart mutation or overwrite state with a blind restoration', async () => {
  const h = harness({ onSelect: async () => { throw new Error('transport timeout'); } });
  const result = await ihsgScreen(h.args);
  assert.equal(result.success, false); assert.equal(result.chart_restoration.outcome, 'pending_or_unknown');
  assert.equal(result.chart_restoration.attempted, false);
  assert.deepEqual(h.calls, [['select', 'IDX:BBCA']]);
  assert.equal(result.page.processed, 0);
});

it('preserves an external chart change instead of restoring over it', async () => {
  const changed = { ...clone(original), symbol: 'NASDAQ:MSFT' };
  const h = harness({ onBars: async (_symbol, setState) => { setState(changed); } });
  const result = await ihsgScreen(h.args);
  assert.equal(result.halt_reason, 'external_chart_change');
  assert.equal(result.chart_restoration.outcome, 'external_change_preserved');
  assert.ok(!h.calls.some(([name]) => name === 'restore'));
  assert.deepEqual(h.state, changed);
});

it('stops dispatching at the scan budget and still performs separately bounded cleanup', async () => {
  let clock = 0;
  const h = harness({ now: () => clock, onBars: async () => { clock += 2000; } });
  const result = await ihsgScreen({ ...h.args, timeout_ms: 1000 });
  assert.equal(result.halt_reason, 'scan_budget_exhausted');
  assert.equal(result.page.processed, 0); assert.equal(result.chart_restoration.verified, true);
  assert.equal(h.calls.filter(([name]) => name === 'select').length, 1);
});

it('rejects invalid selectors, unbounded work, malformed cursors and coercion before touching a chart', () => {
  for (const options of [{ symbols: ['BBCA'] }, { symbols: ['IDX:BBCA', 'IDX:BBCA'] }, { limit: 11 }, { timeout_ms: Infinity }, { criteria: ['unknown'] }, { min_avg_value_trx_50d: -1 }, { cursor: '../../outside' }, { export_reports: 'false' }]) assert.throws(() => screenOptions(options));
});

it('registers the exact requested tool name and bounded schema without launching a scan', () => {
  let definition;
  registerIhsgTools({ tool: (...args) => { definition = args; } });
  assert.equal(definition[0], 'IHSG_Screen');
  assert.equal(definition[2].limit.safeParse(11).success, false);
  assert.equal(definition[2].symbols.safeParse(['IDX:BBCA']).success, true);
  assert.equal(definition[2].export_reports.parse('false'), false);
});

it('refuses an unnamed existing study before any chart mutation rather than assuming it is a disposable replay overlay', async () => {
  const h = harness();
  h.state.studies.push({ id: 'unknown-id', name: 'Unnamed Study' });
  await assert.rejects(ihsgScreen(h.args), error => error.code === 'IHSG_UNVERIFIABLE_STRUCTURE');
  assert.deepEqual(h.calls, []);
});

it('never claims successful restoration if a study or shape disappeared after a confirmed switch', async () => {
  const h = harness({ onRestore: state => { state.studies = []; } });
  const result = await ihsgScreen(h.args);
  assert.equal(result.success, false);
  assert.equal(result.chart_restoration.verified, false);
  assert.equal(result.chart_restoration.structural_verified, false);
});
