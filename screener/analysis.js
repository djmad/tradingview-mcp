import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findPivots, avgValueTraded } from './lib/zigzag.js';
import { findSrZones, nearestResistanceAbove, nearestSupportBelow } from './lib/support_resistance.js';
import { detectDowntrendBreak } from './lib/trendline.js';
import { detectElliottImpulse, detectElliottWave2Support, detectPullbackReversal } from './lib/elliott.js';
import { detectAllPatterns } from './lib/patterns.js';
import { detectBreakoutWithVolume, detectVolumeSpikeGreenCandle, detectConfirmedUptrend } from './lib/volume.js';
import { buildTradingPlan } from './lib/levels.js';
import { CRITERIA_ORDER } from './report.js';

export const CRITERIA = Object.freeze(CRITERIA_ORDER.map(c => c.key));
export const SNAPSHOT_AS_OF = null;
export const SOURCE_PR_PUBLISHED_ON = '2026-09-06';
export const SOURCE_REVISION = '3768597ed07f4925c0574b9faf4cd95a2efd59eb';
export const PR_SOURCE = 'https://github.com/tradesdontlie/tradingview-mcp/pull/511';
export const IDX_SYMBOL = /^IDX:[A-Z0-9]{1,12}$/;

export function loadUniverse() {
  const csv = readFileSync(new URL('./idx_all.csv', import.meta.url), 'utf8');
  const symbols = csv.trim().split(/\r?\n/).slice(1).map(line => `IDX:${line.split(',')[0].trim()}`);
  if (!symbols.length || symbols.some(symbol => !IDX_SYMBOL.test(symbol)) || new Set(symbols).size !== symbols.length) {
    throw new Error('Invalid or duplicated IHSG snapshot universe');
  }
  return { symbols, as_of: SNAPSHOT_AS_OF, source_pr_published_on: SOURCE_PR_PUBLISHED_ON, source_revision: SOURCE_REVISION, source: PR_SOURCE,
    current_membership_verified: false, revision: createHash('sha256').update(symbols.join('\n')).digest('hex') };
}

export function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length > 500) throw new Error('Expected at most 500 bounded OHLCV bars');
  let previous = -Infinity;
  for (const bar of bars) {
    if (!bar || ['time', 'open', 'high', 'low', 'close', 'volume'].some(k => typeof bar[k] !== 'number' || !Number.isFinite(bar[k]))
      || !Number.isInteger(bar.time) || bar.time <= previous || bar.time < 0 || bar.time > 253402300799
      || bar.volume < 0 || bar.low <= 0 || bar.low > Math.min(bar.open, bar.close)
      || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high) throw new Error('Invalid, unordered or non-finite OHLCV bar');
    previous = bar.time;
  }
  return bars;
}

export function analyzeBars(symbol, bars, { min_avg_value_trx_50d = 1_000_000_000, criteria = CRITERIA } = {}) {
  if (!IDX_SYMBOL.test(symbol)) throw new Error('Expected exact IDX:TICKER symbol');
  validateBars(bars);
  const base = { symbol, bar_count: bars.length, data_asof: bars.at(-1)?.time ?? null,
    timeframe: 'D', latest_loaded_bar_may_be_incomplete: true };
  if (bars.length < 60) return { ...base, skipped: true, reason: 'not_enough_bars', matches: [] };
  const avg = avgValueTraded(bars, 50);
  if (avg < min_avg_value_trx_50d) return { ...base, skipped: true, reason: 'illiquid', avg_value_trx_50d: Math.round(avg), matches: [] };
  const pivots = findPivots(bars, 0.04);
  const zones = findSrZones(pivots);
  const lastClose = bars.at(-1).close;
  const selected = new Set(criteria);
  const matches = [];
  const add = (criterion, detail) => {
    if (!selected.has(criterion) || !detail) return;
    const plan = buildTradingPlan(criterion, detail, bars, zones);
    if (plan) matches.push({ criterion, detail, plan });
  };
  add('downtrend_break', detectDowntrendBreak(bars, pivots));
  add('elliott_wave', detectElliottImpulse(bars, pivots));
  add('elliott_wave2', detectElliottWave2Support(bars, pivots));
  add('pullback_reversal', detectPullbackReversal(bars, pivots));
  for (const pattern of detectAllPatterns(bars, pivots)) add(pattern.pattern, pattern);
  add('breakout_resistance_with_volume', detectBreakoutWithVolume(bars, zones));
  add('volume_spike_green_candle', detectVolumeSpikeGreenCandle(bars));
  add('confirmed_uptrend', detectConfirmedUptrend(bars, pivots));
  return { ...base, skipped: false, last_close: lastClose, avg_value_trx_50d: Math.round(avg),
    nearest_resistance: nearestResistanceAbove(zones, lastClose)?.price ?? null,
    nearest_support: nearestSupportBelow(zones, lastClose)?.price ?? null, matches };
}
