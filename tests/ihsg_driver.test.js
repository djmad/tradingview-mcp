import { it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createIhsgChartDriver, ihsgScreen, matchesIhsgInstrument } from '../src/core/ihsg.js';

function browserHarness({ beforeDispatch, restoreViewport, staleSeries = false, delayedFeed = false } = {}) {
  let clock = 0;
  const state = { symbol: 'INDEX:BTCUSD', resolution: '1M', layoutId: 10, layoutName: 'temp',
    chartType: 1, studies: [{ id: 'volume-id', name: 'Volume' }], shapes: [],
    visible: { from: 100, to: 1900000000 }, logical: { from: 0, to: 210 }, spacing: 6, offset: 12, width: 1200 };
  const writes = [];
  let barReads = 0;
  const info = () => ({ full_name: state.symbol,
    pro_name: state.symbol.replace(/^IDX_DLY:/, 'IDX:'),
    exchange: state.symbol.startsWith('IDX') ? 'IDX' : 'INDEX', source_id: state.symbol.startsWith('IDX') ? 'IDX' : 'INDEX',
    delay: state.symbol.startsWith('IDX_DLY:') ? 600 : 0 });
  const series = { symbolInfo: () => staleSeries ? { full_name: 'INDEX:BTCUSD', pro_name: 'INDEX:BTCUSD' } : info(), isLoading: () => false, bars: () => {
    barReads++;
    if (staleSeries) throw new Error('Bars must not be read while the series is stale');
    return { firstIndex: () => 0, lastIndex: () => 79, valueAt: i => [1700000000 + i * 86400, 100 + i, 102 + i, 99 + i, 101 + i, 1e8] };
  } };
  const chart = {
    symbolExt: info, chartType: () => state.chartType, getAllStudies: () => structuredClone(state.studies), getAllShapes: () => structuredClone(state.shapes), symbol: () => state.symbol, resolution: () => state.resolution,
    getVisibleRange: () => ({ ...state.visible }), getVisibleBarsRange: () => ({ ...state.visible }),
    getTimeScaleLogicalRange: () => ({ left: () => state.logical.from, right: () => state.logical.to }),
    getTimeScale: () => ({ barSpacing: () => state.spacing, rightOffset: () => state.offset, width: () => state.width }),
    _chartWidget: { model: () => ({ mainSeries: () => series }) },
    setResolution: value => { writes.push(['resolution', value]); state.resolution = delayedFeed && value === 'D' ? '1D' : value; },
    setSymbol: value => { writes.push(['symbol', value]); state.symbol = delayedFeed ? value.replace(/^IDX:/, 'IDX_DLY:') : value; },
  };
  const window = { TradingViewApi: { _activeChartWidgetWV: { value: () => chart }, _chartWidgetCollection: { metaInfo: {
    id: { value: () => state.layoutId }, name: { value: () => state.layoutName },
  } } } };
  const evaluate = async expression => {
    if (expression.includes('let changed = false')) beforeDispatch?.(state, value => { clock = value; });
    return vm.runInNewContext(expression, { window, Date: { now: () => clock } });
  };
  const driver = createIhsgChartDriver({ evaluate, now: () => clock, sleep: async ms => { clock += ms; }, restoreViewport });
  return { driver, state, writes, now: () => clock, get barReads() { return barReads; } };
}

it('checks the saved layout atomically inside the actual adapter before any symbol/timeframe setter', async () => {
  const h = browserHarness({ beforeDispatch: state => { state.layoutId = 999; state.layoutName = 'User switched layout'; } });
  const expected = await h.driver.snapshot(1000);
  await assert.rejects(h.driver.select('IDX:BBCA', 'D', expected, 1000), error => error.code === 'IHSG_EXTERNAL_CHANGE');
  assert.deepEqual(h.writes, []);
});

it('rechecks viewport scale in the same mutation expression rather than trusting an earlier read', async () => {
  const h = browserHarness({ beforeDispatch: state => { state.offset = 50; } });
  const expected = await h.driver.snapshot(1000);
  await assert.rejects(h.driver.select('IDX:BBCA', 'D', expected, 1000), error => error.code === 'IHSG_EXTERNAL_CHANGE');
  assert.deepEqual(h.writes, []);
});

it('does not dispatch either setter when its work arrives after the operation deadline', async () => {
  const h = browserHarness({ beforeDispatch: (_state, setClock) => { setClock(2000); } });
  const expected = await h.driver.snapshot(1000);
  await assert.rejects(h.driver.select('IDX:BBCA', 'D', expected, 1000), error => error.code === 'IHSG_BUDGET_EXPIRED' && error.no_mutation === true);
  assert.deepEqual(h.writes, []);
});

it('uses the shared exact-scale helper with the expected-current guard for future-whitespace restoration', async () => {
  let restoreArgs;
  const h = browserHarness({ restoreViewport: async args => {
    restoreArgs = args;
    assert.equal(args.snapshot.visible_range.to, 1900000000);
    assert.equal(args.expected_current.symbol, 'INDEX:BTCUSD');
    assert.equal(args.expected_current.resolution, '1M');
    h.state.visible = structuredClone(args.snapshot.visible_range);
    h.state.logical = structuredClone(args.snapshot.logical_range);
    h.state.spacing = args.snapshot.bar_spacing; h.state.offset = args.snapshot.right_offset;
    return { success: true, verified: true };
  } });
  const original = await h.driver.snapshot(3000);
  h.state.symbol = 'IDX:BBCA'; h.state.resolution = 'D'; h.state.offset = 2;
  h.state.visible = { from: 1000, to: 2000 }; h.state.logical = { from: 10, to: 300 };
  const selected = await h.driver.snapshot(3000);
  const restored = await h.driver.restore(original, selected, 3000);
  assert.ok(restoreArgs);
  assert.equal(restored.viewport.right_offset, original.viewport.right_offset);
  assert.deepEqual(restored.visible_range, original.visible_range);
});

it('does not analyze stale old-series bars when the header has switched and loading falsely appears clear', async () => {
  const h = browserHarness({ staleSeries: true });
  const result = await ihsgScreen({ symbols: ['IDX:BBCA'], timeout_ms: 1000, export_reports: false, _deps: { driver: h.driver, now: h.now } });
  assert.equal(result.success, false);
  assert.equal(result.outcomes.length, 0);
  assert.equal(result.page.processed, 0);
  assert.equal(result.chart_restoration.outcome, 'pending_or_unknown');
  assert.equal(h.barReads, 0);
  assert.deepEqual(h.writes, [['resolution', 'D'], ['symbol', 'IDX:BBCA']]);
});

it('accepts only metadata-proven IDX delayed-feed normalization and equivalent 1D, recording actual feed and delay', async () => {
  const h = browserHarness({ delayedFeed: true });
  const result = await ihsgScreen({ symbols: ['IDX:BBCA'], timeout_ms: 5000, export_reports: false, _deps: { driver: h.driver, now: h.now } });
  assert.equal(result.success, true);
  assert.equal(result.outcomes[0].requested_symbol, 'IDX:BBCA');
  assert.equal(result.outcomes[0].actual_symbol, 'IDX_DLY:BBCA');
  assert.equal(result.outcomes[0].actual_resolution, '1D');
  assert.equal(result.outcomes[0].delay_seconds, 600);
  assert.equal(result.outcomes[0].delayed, true);
  assert.equal(result.outcomes[0].bar_count, 80);
  assert.equal(result.chart_restoration.verified, true);
  assert.equal(h.state.symbol, 'INDEX:BTCUSD');
  assert.equal(h.state.resolution, '1M');
});

it('never accepts a same bare ticker on a wrong exchange or a stale old-series canonical name', () => {
  const proof = { symbol: 'IDX_DLY:BBCA', series_full_name: 'IDX_DLY:BBCA',
    chart_canonical_symbol: 'IDX:BBCA', series_canonical_symbol: 'IDX:BBCA',
    chart_exchange: 'IDX', series_source_id: 'IDX', chart_delay: 600, series_delay: 600 };
  assert.equal(matchesIhsgInstrument('IDX:BBCA', proof), true);
  for (const change of [{ symbol: 'OTHER:BBCA' }, { series_full_name: 'OTHER:BBCA' },
    { series_canonical_symbol: 'INDEX:BTCUSD' }, { chart_canonical_symbol: 'OTHER:BBCA' },
    { chart_delay: 0 }, { series_delay: 900 }, { series_source_id: 'OTHER' }]) {
    assert.equal(matchesIhsgInstrument('IDX:BBCA', { ...proof, ...change }), false);
  }
});

it('guards study and drawing membership atomically before the chart setter', async () => {
  const h = browserHarness({ beforeDispatch: state => { state.studies = []; } });
  const expected = await h.driver.snapshot(1000);
  await assert.rejects(h.driver.select('IDX:BBCA', 'D', expected, 1000), error => error.code === 'IHSG_EXTERNAL_CHANGE');
  assert.deepEqual(h.writes, []);
});
