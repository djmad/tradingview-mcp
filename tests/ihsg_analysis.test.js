import { it } from 'node:test';
import assert from 'node:assert/strict';
import { loadUniverse, analyzeBars, CRITERIA, validateBars } from '../screener/analysis.js';
import { findPivots, avgValueTraded } from '../screener/lib/zigzag.js';
import { detectVolumeSpikeGreenCandle, detectConfirmedUptrend } from '../screener/lib/volume.js';
import { buildTradingPlan } from '../screener/lib/levels.js';

const bars = (length = 80) => Array.from({ length }, (_, i) => ({ time: 1700000000 + i * 86400, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100000000 }));

it('loads the source 951-member snapshot with qualified unique IDX symbols and explicit freshness limits', () => {
  const universe = loadUniverse();
  assert.equal(universe.symbols.length, 951);
  assert.equal(new Set(universe.symbols).size, 951);
  assert.ok(universe.symbols.every(s => /^IDX:[A-Z0-9]+$/.test(s)));
  assert.equal(universe.current_membership_verified, false);
  assert.equal(universe.as_of, null);
  assert.equal(universe.source_pr_published_on, '2026-09-06');
  assert.match(universe.source_revision, /^[0-9a-f]{40}$/);
  assert.match(universe.revision, /^[0-9a-f]{64}$/);
  assert.equal(CRITERIA.length, 12);
});

it('requires reversed pivots and does not treat the live running extreme as a confirmed swing', () => {
  const data = [100, 110, 115, 108, 100, 106, 120].map((close, i) => ({ time: i, open: close, high: close, low: close, close, volume: 1 }));
  const pivots = findPivots(data, 0.04);
  assert.deepEqual(pivots.map(p => [p.type, p.price]), [['high', 115], ['low', 100]]);
  assert.ok(pivots.every(p => p.index < data.length - 1));
});

it('uses average daily transaction value and applies the configurable liquidity boundary inclusively', () => {
  const data = bars(); const minimum = avgValueTraded(data, 50);
  assert.equal(analyzeBars('IDX:BBCA', data, { min_avg_value_trx_50d: minimum + 1 }).reason, 'illiquid');
  assert.equal(analyzeBars('IDX:BBCA', data, { min_avg_value_trx_50d: minimum }).skipped, false);
  assert.equal(analyzeBars('IDX:BBCA', data.slice(0, 59)).reason, 'not_enough_bars');
});

it('requires green candle, volume threshold and above-average context for a volume spike', () => {
  const data = bars(); data.at(-1).volume = 200000000;
  assert.ok(detectVolumeSpikeGreenCandle(data));
  data.at(-1).volume = 199999999;
  assert.equal(detectVolumeSpikeGreenCandle(data), null);
  data.at(-1).volume = 300000000; data.at(-1).open = data.at(-1).close + 1;
  assert.equal(detectVolumeSpikeGreenCandle(data), null);
});

it('does not invent SMA200 for a shorter history and rejects already-reached targets', () => {
  const data = bars(80);
  const trend = detectConfirmedUptrend(data, [
    { type: 'high', price: 100 }, { type: 'low', price: 90 },
    { type: 'high', price: 140 }, { type: 'low', price: 110 },
  ]);
  assert.ok(trend); assert.equal(trend.sma200, null);
  assert.equal(buildTradingPlan('elliott_wave', { wave_points: { w4: { price: 179 } }, invalidation_level: 170, wave5_targets: { tp1_0618: 170, tp2_1000: 190, extended_1618: 200 } }, data, []), null);
});

it('validates OHLCV identity-independent structure and filters requested criteria', () => {
  const data = bars();
  assert.throws(() => validateBars([...data, data.at(-1)]), /unordered/);
  assert.throws(() => validateBars([{ ...data[0], close: Infinity }]), /non-finite/);
  assert.throws(() => validateBars([{ ...data[0], low: 10000 }]), /Invalid/);
  const result = analyzeBars('IDX:BBCA', data, { min_avg_value_trx_50d: 0, criteria: ['double_bottom'] });
  assert.ok(result.matches.every(m => m.criterion === 'double_bottom'));
  assert.equal(result.data_asof, data.at(-1).time);
  assert.equal(result.latest_loaded_bar_may_be_incomplete, true);
});
