import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/chart.js';

export function registerChartTools(server) {
  server.tool('chart_get_state', 'Read the active chart state: exchange-qualified symbol in SOURCE:TICKER form, resolution, numeric chartType and studies as {id,name}. Use the returned studies[].id for study-specific tools; IDs can become stale after chart changes.', {}, async () => {
    try { return jsonResult(await core.getState()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_set', 'Change one or more chart properties in a single call. Pass any subset of: symbol (switch ticker), timeframe (switch resolution), chart_type (switch style), visible_range (zoom to unix-second range), scroll_to (center view on a date). Fields are applied in order: symbol → timeframe → chart_type → visible_range → scroll_to. Returns { success, applied: { <field>: <core-result>, ... } }. Errors short-circuit. At least one field is required. Use chart_get_state first to discover current values; use chart_manage_indicator (separate tool) for indicators.', {
    symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').optional().describe('Required SOURCE:TICKER form, e.g. TVC:GOLD, INDEX:BTCUSD, NYSE:AI, XETR:SIE or CME_MINI:ES1!. If the source/exchange is unknown or ambiguous, call symbol_search first and use the selected results[].full_name exactly.'),
    timeframe: z.string().optional().describe('Timeframe (e.g., 1, 5, 15, 60, D, W, M)'),
    chart_type: z.string().optional().describe('Chart type: Bars(0), Candles(1), Line(2), Area(3), Renko(4), Kagi(5), PointAndFigure(6), LineBreak(7), HeikinAshi(8), HollowCandles(9) — pass name or number'),
    visible_range: z.object({
      from: z.coerce.number().describe('Start unix timestamp (seconds)'),
      to: z.coerce.number().describe('End unix timestamp (seconds)'),
    }).optional().describe('Zoom to a specific date range'),
    scroll_to: z.string().optional().describe('Center view on a date (ISO "2024-01-15" or unix-seconds string)'),
  }, async ({ symbol, timeframe, chart_type, visible_range, scroll_to }) => {
    try {
      const results = {};
      if (symbol !== undefined) results.symbol = await core.setSymbol({ symbol });
      if (timeframe !== undefined) results.timeframe = await core.setTimeframe({ timeframe });
      if (chart_type !== undefined) results.chart_type = await core.setType({ chart_type });
      if (visible_range !== undefined) results.visible_range = await core.setVisibleRange(visible_range);
      if (scroll_to !== undefined) results.scroll_to = await core.scrollToDate({ date: scroll_to });
      if (Object.keys(results).length === 0) return jsonResult({ success: false, error: 'No fields provided. Pass at least one of: symbol, timeframe, chart_type, visible_range, scroll_to.' }, true);
      return jsonResult({ success: true, applied: results });
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_manage_indicator', 'Add or remove an indicator/study on the chart', {
    action: z.enum(['add', 'remove']).describe('Action: add or remove'),
    indicator: z.string().optional().describe('Full indicator name (required for add): "Relative Strength Index", "MACD", "Volume", "Moving Average", "Bollinger Bands", "Moving Average Exponential". Short names like RSI/EMA do NOT work. Not needed for remove.'),
    entity_id: z.string().optional().describe('Entity ID (from chart_get_state). Required for remove.'),
    inputs: z.string().optional().describe('JSON string of input overrides for the indicator (e.g., \'{"length": 20}\')'),
  }, async ({ action, indicator, entity_id, inputs }) => {
    try {
      if (action === 'add' && !indicator) throw new Error('indicator name is required for add action.');
      return jsonResult(await core.manageIndicator({ action, indicator, entity_id, inputs }));
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('add_known_indicator', 'Idempotently add one exact, versioned TradingView study in a single MCP call. Pass the full stable TradingView study ID, never an abbreviation and never a session-scoped six-character entity ID. If the exact study and configured signature already exist, it is reused without creating a duplicate. Otherwise the tool adds the correct implementation, verifies its internal study name and full input signature, and returns the current entity_id. MAExp@tv-basicstudies-274 accepts length 9, 21, 50, or 200 with source close; omit length only when length 9 is intended. Other supported IDs: Volume@tv-basicstudies-274, PUB;8a91e8e55f4a434f9a60b56f5660c244 ([Mad] Triple Bollinger Bands MTF by djmad), Script$STD;MACD@tv-scripting-101, and Script$STD;RSI@tv-scripting-101.', {
    indicator_id: z.enum([
      'MAExp@tv-basicstudies-274',
      'Volume@tv-basicstudies-274',
      'PUB;8a91e8e55f4a434f9a60b56f5660c244',
      'Script$STD;MACD@tv-scripting-101',
      'Script$STD;RSI@tv-scripting-101',
    ]).describe('Full stable TradingView study ID. Do not pass EMA, MACD, RSI, Volume, a display title, or a six-character chart entity ID.'),
    length: z.union([z.literal(9), z.literal(21), z.literal(50), z.literal(200)]).optional().describe('Only for MAExp@tv-basicstudies-274. Required explicitly for analysis calls; allowed values are 9, 21, 50, and 200. Source is always close.'),
  }, async ({ indicator_id, length }) => {
    try { return jsonResult(await core.addKnownIndicator({ indicator_id, length })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_get_visible_range', 'Read the currently visible range of the active chart. Date bounds are Unix seconds and bar bounds are internal indices. This describes the viewport only, not all loaded or available history.', {}, async () => {
    try { return jsonResult(await core.getVisibleRange()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('symbol_info', 'Read metadata only for the active chart symbol, including full_name/SOURCE:TICKER, exchange, type, description, resolution and chart type. It cannot query a different symbol and does not change the chart.', {}, async () => {
    try { return jsonResult(await core.symbolInfo()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('symbol_search', 'Search TradingView symbol metadata without changing the chart. Use this whenever a ticker\'s source/exchange is unknown or ambiguous. Returns at most 15 matches; select by exchange, type and description, then use results[].full_name exactly as SOURCE:TICKER for every later symbol input.', {
    query: z.string().describe('Ticker, company name or keyword, e.g. AAPL, gold, crude oil or Siemens. This is a search term, so it need not be SOURCE:TICKER.'),
    type: z.string().optional().describe('Filter by type (e.g., "stock", "futures", "crypto", "forex")'),
  }, async ({ query, type }) => {
    try { return jsonResult(await core.symbolSearch({ query, type })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
