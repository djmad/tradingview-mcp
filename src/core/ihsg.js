import { createHash } from 'node:crypto';
import { evaluate } from '../connection.js';
import { captureViewport, restoreViewport } from './viewport.js';
import { analyzeBars, loadUniverse, CRITERIA, IDX_SYMBOL } from '../../screener/analysis.js';
import { writeBatchReports } from '../../screener/output.js';

const API = 'window.TradingViewApi._activeChartWidgetWV.value()';
const stateFunction = `function snapshot() {
  const chart = ${API}; const series = chart._chartWidget.model().mainSeries();
  const ext = chart.symbolExt() || {}; const info = series.symbolInfo() || {};
  const unwrap = value => value && typeof value.value === 'function' ? value.value() : value;
  const scale = chart.getTimeScale(); const logical = chart.getTimeScaleLogicalRange();
  const meta = window.TradingViewApi._chartWidgetCollection?.metaInfo;
  const viewport = { layout_id: unwrap(meta?.id) ?? null, layout_name: unwrap(meta?.name) ?? null,
    symbol: ext.full_name || ext.pro_name || chart.symbol(), resolution: chart.resolution(),
    visible_range: chart.getVisibleRange(), logical_range: { from: logical.left(), to: logical.right() },
    bar_spacing: scale.barSpacing(), right_offset: scale.rightOffset(), width: scale.width() };
  return { viewport, chart_type: chart.chartType(), studies: chart.getAllStudies(), shapes: chart.getAllShapes(), symbol: ext.full_name || ext.pro_name || chart.symbol(), resolution: chart.resolution(),
    visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange(),
    chart_canonical_symbol: ext.pro_name ?? null, chart_exchange: ext.exchange ?? null, chart_delay: ext.delay ?? null,
    series_full_name: info.full_name ?? null, series_canonical_symbol: info.pro_name ?? null,
    series_source_id: info.source_id ?? null, series_exchange: info.exchange ?? null, series_delay: info.delay ?? null,
    series_symbols: [info.full_name, info.pro_name].filter(v => typeof v === 'string' && v.includes(':')),
    loading: unwrap(series.isLoading()) };
}`;

export function normalizeIhsgResolution(value) {
  return value === 'D' || value === '1D' ? 'D' : value;
}

// Only explicitly proven canonical IDX -> IDX_DLY metadata is accepted. Never
// compare bare tickers or accept a same-named instrument on another exchange.
export function matchesIhsgInstrument(requested, state) {
  if (state?.symbol === requested && state.series_full_name === requested) return true;
  if (!IDX_SYMBOL.test(requested)) return state?.symbol === requested && state.series_symbols?.includes(requested);
  const delayed = requested.replace(/^IDX:/, 'IDX_DLY:');
  const allowed = new Set([requested, delayed]);
  return allowed.has(state?.symbol) && allowed.has(state?.series_full_name)
    && state.chart_canonical_symbol === requested && state.series_canonical_symbol === requested
    && state.chart_exchange === 'IDX' && (state.series_source_id === 'IDX' || state.series_exchange === 'IDX')
    && Number.isFinite(state.chart_delay) && state.chart_delay > 0 && state.chart_delay <= 86400
    && state.series_delay === state.chart_delay;
}

function integer(value, fallback, name, minimum, maximum) {
  const actual = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(actual) || actual < minimum || actual > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  return actual;
}

export function screenOptions(args = {}) {
  const universe = loadUniverse();
  let symbols = universe.symbols;
  if (args.symbols !== undefined) {
    if (!Array.isArray(args.symbols) || !args.symbols.length || args.symbols.length > 1000 || args.symbols.some(s => typeof s !== 'string' || !IDX_SYMBOL.test(s)) || new Set(args.symbols).size !== args.symbols.length) throw new Error('symbols must contain 1–1000 unique exact IDX:TICKER values');
    symbols = args.symbols;
  }
  const criteria = args.criteria ?? [...CRITERIA];
  if (!Array.isArray(criteria) || !criteria.length || criteria.length > CRITERIA.length || criteria.some(c => !CRITERIA.includes(c)) || new Set(criteria).size !== criteria.length) throw new Error('Unknown or duplicate screening criteria');
  const minimum = args.min_avg_value_trx_50d ?? 1_000_000_000;
  if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 0 || minimum > 1e15) throw new Error('min_avg_value_trx_50d must be finite Rupiah between 0 and 1e15');
  if (args.export_reports !== undefined && typeof args.export_reports !== 'boolean') throw new Error('export_reports must be a boolean');
  const signature = createHash('sha256').update(JSON.stringify({ symbols, criteria: [...criteria].sort(), minimum })).digest('hex');
  let offset = 0;
  if (args.cursor !== undefined) {
    if (typeof args.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(args.cursor)) throw new Error('Invalid IHSG cursor');
    let cursor;
    try { cursor = JSON.parse(Buffer.from(args.cursor, 'base64url').toString('utf8')); } catch { throw new Error('Invalid IHSG cursor'); }
    if (cursor?.v !== 1 || cursor.signature !== signature || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > symbols.length) throw new Error('Cursor does not match this universe and screening configuration');
    offset = cursor.offset;
  }
  return { universe: { ...universe, symbols: undefined, selected_count: symbols.length, selection: args.symbols ? 'explicit_symbols' : 'source_snapshot' }, symbols, criteria,
    min_avg_value_trx_50d: minimum, offset, signature, limit: integer(args.limit, 5, 'limit', 1, 10),
    timeout_ms: integer(args.timeout_ms, 30000, 'timeout_ms', 1000, 45000), export_reports: args.export_reports ?? true };
}

function cursorFor(options, offset) {
  return Buffer.from(JSON.stringify({ v: 1, offset, signature: options.signature })).toString('base64url');
}

function sameState(a, b) {
  return a?.symbol === b?.symbol && a?.resolution === b?.resolution
    && JSON.stringify(a?.bars_range) === JSON.stringify(b?.bars_range)
    && JSON.stringify(a?.visible_range) === JSON.stringify(b?.visible_range)
    && JSON.stringify(a?.viewport) === JSON.stringify(b?.viewport)
    && a?.chart_type === b?.chart_type && JSON.stringify(a?.studies) === JSON.stringify(b?.studies)
    && JSON.stringify(a?.shapes) === JSON.stringify(b?.shapes);
}

export function createIhsgChartDriver({ evaluate: ev = evaluate, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now,
  captureViewport: capture = captureViewport, restoreViewport: restoreView = restoreViewport } = {}) {
  const remaining = end => {
    const left = end - now();
    if (left <= 0) { const error = new Error('IHSG operation budget expired'); error.code = 'IHSG_BUDGET_EXPIRED'; error.no_mutation = true; throw error; }
    return left;
  };
  const snapshot = async timeoutMs => {
    const end = now() + timeoutMs;
    const viewport = await capture({ timeout_ms: remaining(end), _deps: { evaluate: (expr, opts) => ev(expr, { ...opts, timeoutMs: remaining(end) }) } });
    const state = await ev(`(${stateFunction})()`, { timeoutMs: remaining(end) });
    if (state?.symbol !== viewport.symbol || state?.resolution !== viewport.resolution
      || JSON.stringify(state?.viewport) !== JSON.stringify(viewport)) throw new Error('Chart changed during IHSG snapshot');
    return { ...state, viewport };
  };
  async function waitReady(symbol, resolution, timeoutMs, expected) {
    const end = now() + timeoutMs;
    let previous;
    let stable = 0;
    while (now() < end) {
      const state = await snapshot(remaining(end));
      if (state.viewport.layout_id !== expected.viewport.layout_id || state.viewport.layout_name !== expected.viewport.layout_name) { const error = new Error('Saved layout changed externally'); error.code = 'IHSG_EXTERNAL_CHANGE'; throw error; }
      if (matchesIhsgInstrument(symbol, state) && normalizeIhsgResolution(state.resolution) === normalizeIhsgResolution(resolution) && state.loading === false) {
        const signature = JSON.stringify([state.symbol, state.resolution, state.visible_range, state.bars_range]);
        stable = signature === previous ? stable + 1 : 0;
        previous = signature;
        if (stable >= 2) return state;
      } else { previous = null; stable = 0; }
      await sleep(Math.min(200, remaining(end)));
    }
    const error = new Error('Chart data readiness was not confirmed'); error.code = 'IHSG_READY_TIMEOUT'; throw error;
  }
  async function select(symbol, resolution, expected, timeoutMs) {
    const end = now() + timeoutMs;
    const receipt = await ev(`(() => {
      const snapshot = ${stateFunction}; const current = snapshot(); const expected = ${JSON.stringify(expected)};
      if (current.symbol !== expected.symbol || current.resolution !== expected.resolution || JSON.stringify(current.bars_range) !== JSON.stringify(expected.bars_range) || JSON.stringify(current.visible_range) !== JSON.stringify(expected.visible_range) || JSON.stringify(current.viewport) !== JSON.stringify(expected.viewport) || current.chart_type !== expected.chart_type || JSON.stringify(current.studies) !== JSON.stringify(expected.studies) || JSON.stringify(current.shapes) !== JSON.stringify(expected.shapes)) return { dispatched: false, external_change: true };
      const chart = ${API}; let changed = false;
      const expired = () => Date.now() >= ${end};
      const resolutionKey = value => value === 'D' || value === '1D' ? 'D' : value;
      if (resolutionKey(chart.resolution()) !== resolutionKey(${JSON.stringify(resolution)})) {
        if (expired()) return { dispatched: changed, budget_exhausted: true };
        chart.setResolution(${JSON.stringify(resolution)}, {}); changed = true;
      }
      const matches = ${matchesIhsgInstrument.toString()};
      const IDX_SYMBOL = /^IDX:[A-Z0-9]{1,12}$/;
      if (!matches(${JSON.stringify(symbol)}, current)) {
        if (expired()) return { dispatched: changed, budget_exhausted: true };
        chart.setSymbol(${JSON.stringify(symbol)}, {}); changed = true;
      }
      return { dispatched: true };
    })()`, { timeoutMs: remaining(end) });
    if (receipt?.budget_exhausted && !receipt.dispatched) { const error = new Error('IHSG operation budget expired before mutation'); error.code = 'IHSG_BUDGET_EXPIRED'; error.no_mutation = true; throw error; }
    if (!receipt?.dispatched) { const error = new Error('Chart changed externally'); error.code = 'IHSG_EXTERNAL_CHANGE'; error.no_mutation = true; throw error; }
    try { return await waitReady(symbol, resolution, remaining(end), expected); }
    catch (error) { error.no_mutation = false; error.command_may_have_executed = true; throw error; }
  }
  async function bars(expected, timeoutMs) {
    const result = await ev(`(() => {
      const snapshot = ${stateFunction}; const state = snapshot(); const expected = ${JSON.stringify(expected)};
      if (state.symbol !== expected.symbol || state.resolution !== expected.resolution || state.loading !== false || state.series_full_name !== expected.series_full_name || state.series_canonical_symbol !== expected.series_canonical_symbol || JSON.stringify(state.viewport) !== JSON.stringify(expected.viewport) || state.chart_type !== expected.chart_type || JSON.stringify(state.studies) !== JSON.stringify(expected.studies) || JSON.stringify(state.shapes) !== JSON.stringify(expected.shapes)) return { external_change: true };
      const bars = ${API}._chartWidget.model().mainSeries().bars(); const result = [];
      for (let i = Math.max(bars.firstIndex(), bars.lastIndex() - 499); i <= bars.lastIndex(); i++) {
        const bar = bars.valueAt(i); if (bar) result.push({ time: bar[0], open: bar[1], high: bar[2], low: bar[3], close: bar[4], volume: bar[5] || 0 });
      }
      return result;
    })()`, { timeoutMs });
    if (result?.external_change) { const error = new Error('Chart state changed before OHLCV read'); error.code = 'IHSG_EXTERNAL_CHANGE'; throw error; }
    return result;
  }
  async function restore(original, expected, timeoutMs) {
    const end = now() + timeoutMs;
    const selected = await select(original.symbol, original.resolution, expected, remaining(end));
    if (JSON.stringify(original.viewport) !== JSON.stringify(selected.viewport)) {
      const restoreBudget = remaining(end);
      if (restoreBudget < 100) throw new Error('Insufficient budget to verify exact viewport restoration');
      const result = await restoreView({ snapshot: original.viewport, expected_current: selected.viewport,
        timeout_ms: restoreBudget, _deps: { evaluate: (expr, opts) => ev(expr, { ...opts, timeoutMs: remaining(end) }), sleep } });
      if (!result.success || !result.verified) throw new Error('Exact logical viewport restoration was not confirmed');
    }
    return snapshot(remaining(end));
  }
  return { snapshot, select, bars, restore };
}

export function validateIhsgStructure(snapshot) {
  const uncertain = () => { const error = new Error('Existing chart studies/drawings cannot be safely identified; scan not started'); error.code = 'IHSG_UNVERIFIABLE_STRUCTURE'; throw error; };
  if (!Number.isInteger(snapshot?.chart_type) || !Array.isArray(snapshot.studies) || !Array.isArray(snapshot.shapes)
    || snapshot.loading !== false || !matchesIhsgInstrument(snapshot.symbol, snapshot)) uncertain();
  if (snapshot.studies.length > 100 || snapshot.shapes.length > 1000) uncertain();
  if ([snapshot.studies, snapshot.shapes].some(items => new Set(items.map(item => item?.id)).size !== items.length)) uncertain();
  for (const study of snapshot.studies) {
    if (typeof study?.id !== 'string' || !study.id || typeof study.name !== 'string' || !study.name.trim()
      || /^(?:unnamed(?:\s+study)?|unknown|untitled)$/i.test(study.name.trim())) uncertain();
  }
  for (const shape of snapshot.shapes) if (typeof shape?.id !== 'string' || !shape.id) uncertain();
}

export async function ihsgScreen(args = {}) {
  const options = screenOptions(args);
  const deps = args._deps || {};
  const now = deps.now || Date.now;
  const driver = deps.driver || createIhsgChartDriver(deps);
  const start = now(); const end = start + options.timeout_ms;
  const remaining = () => { const left = end - now(); if (left <= 0) { const error = new Error('IHSG scan budget expired'); error.code = 'IHSG_BUDGET_EXPIRED'; error.no_mutation = true; throw error; } return left; };
  const original = await driver.snapshot(remaining());
  if (!original?.symbol || !original?.resolution || !original?.visible_range || !original?.bars_range) throw new Error('A complete initial chart snapshot is required');
  validateIhsgStructure(original);
  let expected = original; let mutated = false; let pending = false; let external = false;
  let processed = 0; let halt = null;
  const outcomes = []; const errors = [];
  const page = options.symbols.slice(options.offset, options.offset + options.limit);
  let restoration = { attempted: false, verified: true, outcome: 'no_changes' };
  try {
    for (const symbol of page) {
      if (now() >= end) { halt = 'scan_budget_exhausted'; break; }
      const current = await driver.snapshot(remaining());
      if (!sameState(current, expected)) { external = true; halt = 'external_chart_change'; break; }
      try {
        const selectBudget = remaining();
        pending = true;
        expected = await driver.select(symbol, 'D', current, selectBudget);
        pending = false; mutated = true;
        const bars = await driver.bars(expected, remaining());
        const after = await driver.snapshot(remaining());
        if (!sameState(after, expected)) { external = true; halt = 'external_chart_change'; break; }
        outcomes.push({ ...analyzeBars(symbol, bars, options), requested_symbol: symbol,
          actual_symbol: expected.series_full_name || expected.symbol, chart_symbol: expected.symbol, actual_resolution: expected.resolution,
          delay_seconds: Number.isFinite(expected.series_delay) ? expected.series_delay : null,
          delayed: Number.isFinite(expected.series_delay) ? expected.series_delay > 0 : null });
        processed++;
      } catch (error) {
        if (error.code === 'IHSG_EXTERNAL_CHANGE') { external = true; pending = false; halt = 'external_chart_change'; break; }
        if (error.code === 'IHSG_BUDGET_EXPIRED' && error.no_mutation) { pending = false; halt = 'scan_budget_exhausted'; break; }
        errors.push({ symbol, error: pending ? 'CHART_OPERATION_UNCONFIRMED' : 'SYMBOL_DATA_UNAVAILABLE' });
        if (pending) { if (error.no_mutation) pending = false; halt = 'chart_operation_unconfirmed'; break; }
        processed++;
      }
    }
  } catch (error) { halt = error.code === 'IHSG_BUDGET_EXPIRED' ? 'scan_budget_exhausted' : 'chart_state_unavailable'; }
  finally {
    if (external || pending) restoration = { attempted: false, verified: false, outcome: external ? 'external_change_preserved' : 'pending_or_unknown', note: 'No blind restoration or retry was dispatched.' };
    else if (mutated) {
      try {
        const cleanupEnd = now() + 5000;
        const cleanupBudget = () => { const left = cleanupEnd - now(); if (left <= 0) throw new Error('IHSG cleanup budget expired'); return left; };
        const current = await driver.snapshot(cleanupBudget());
        if (!sameState(current, expected)) restoration = { attempted: false, verified: false, outcome: 'external_change_preserved' };
        else {
          const restored = await driver.restore(original, current, cleanupBudget());
          restoration = { attempted: true, verified: sameState(restored, original),
            structural_verified: restored.chart_type === original.chart_type && JSON.stringify(restored.studies) === JSON.stringify(original.studies) && JSON.stringify(restored.shapes) === JSON.stringify(original.shapes),
            outcome: sameState(restored, original) ? 'confirmed' : 'unconfirmed' };
        }
      } catch { restoration = { attempted: true, verified: false, outcome: 'pending_or_unknown' }; }
    }
  }
  const next = options.offset + processed;
  const scan = {
    success: !halt && !errors.length && restoration.verified, generated_at: new Date().toISOString(),
    timeframe: 'D', universe: options.universe,
    page: { offset: options.offset, requested: page.length, processed, total: options.symbols.length,
      done: next >= options.symbols.length, next_cursor: next < options.symbols.length ? cursorFor(options, next) : null },
    partial: Boolean(halt || errors.length), halt_reason: halt,
    total_scanned: outcomes.length, total_matches: outcomes.filter(r => r.matches.length).length,
    total_errors: errors.length, total_skipped_illiquid: outcomes.filter(r => r.reason === 'illiquid').length,
    min_avg_value_trx_50d: options.min_avg_value_trx_50d, criteria: options.criteria,
    elapsed_seconds: Math.round((now() - start) / 100) / 10,
    outcomes, results: outcomes.filter(r => r.matches.length), errors, chart_restoration: restoration,
    method: 'PR511 pivot/Fibonacci/pattern/volume heuristics; not a validated trading strategy or an execution tool.',
  };
  if (options.export_reports) {
    scan.reports = await (deps.writeReports || writeBatchReports)(scan);
    if (!scan.reports.success) scan.success = false;
  }
  return scan;
}
