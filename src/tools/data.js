import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/data.js';

export function registerDataTools(server) {
  server.tool('data_get_ohlcv', 'Read the newest OHLCV bars already loaded for the active SOURCE:TICKER and timeframe. Returns bars in chronological order. Default 100, maximum 5000; this tool does not page older history. Start with summary=true because raw bars can be very large.', {
    count: z.coerce.number().int().min(1).max(5000).optional().describe('Number of newest loaded bars to retrieve (default 100, hard maximum 5000).'),
    summary: z.coerce.boolean().optional().describe('Return summary stats (high, low, open, close, avg volume, range) instead of all bars — much smaller output'),
  }, async ({ count, summary }) => {
    try { return jsonResult(await core.getOhlcv({ count, summary })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_get_indicator', 'Read one study on the active chart. Requires the exact current studies[].id returned by chart_get_state; missing or stale IDs fail. Returns study name, visibility and filtered input values, not plotted time-series values.', {
    entity_id: z.string().describe('Exact studies[].id from a fresh chart_get_state response.'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.getIndicator({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_get_strategy_results', 'Read performance metrics for the first strategy already attached to the active chart. Does not add a strategy or open Strategy Tester. An empty result may still have success=true; inspect metric_count and error.', {}, async () => {
    try { return jsonResult(await core.getStrategyResults()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_get_trades', 'Read a bounded sample of trades from the first strategy already attached to the active chart. This is not a full-history export. An empty result may still have success=true; inspect trade_count and error.', {
    max_trades: z.coerce.number().int().min(1).max(20).optional().describe('Maximum trades to return (default and hard maximum: 20).'),
  }, async ({ max_trades }) => {
    try { return jsonResult(await core.getTrades({ max_trades })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_get_equity', 'Read the equity curve for the first strategy already attached to the active chart. If the full curve is unavailable, equity_summary and note may be returned instead. Inspect data_points and error; empty data is a valid conditional result.', {}, async () => {
    try { return jsonResult(await core.getEquity()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('quote_get', 'Read the latest loaded bar for the active chart as a compact quote (last/close, OHLC, volume and optional bid/ask). This is chart-derived, not an independent tick feed, and never switches symbols. If symbol is supplied it must exactly match the active SOURCE:TICKER.', {
    symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').optional().describe('Optional exact active symbol in SOURCE:TICKER form, e.g. TVC:GOLD, INDEX:BTCUSD, NYSE:AI or XETR:SIE. Omit to use the active chart. If the source is unclear, resolve it with symbol_search and use results[].full_name.'),
  }, async ({ symbol }) => {
    try { return jsonResult(await core.getQuote({ symbol })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('depth_get', 'Read only the order-book rows currently rendered in the open TradingView DOM/Depth of Market panel. The panel must already be open and supported by the active instrument. This is not a complete market-depth feed; unclassified panels may return raw_values and a note.', {}, async () => {
    try { return jsonResult(await core.getDepth()); }
    catch (err) { return jsonResult({ success: false, error: err.message, hint: 'Open the DOM panel in TradingView before using this tool.' }, true); }
  });

  server.tool('data_get_pine_graphics', 'Read line.new, label.new, table.new and box.new graphics from visible Pine studies on the active chart. Only requested kinds are returned. Empty arrays are valid. Use study_filter and a kinds subset to control potentially large output; verbose=true includes raw IDs, coordinates and styles.', {
    kinds: z.array(z.enum(['lines', 'labels', 'tables', 'boxes'])).optional().describe('Which graphics to return. Default: all four. Pass a subset (e.g. ["lines","labels"]) for smaller payloads.'),
    study_filter: z.string().optional().describe('Case-sensitive substring matched against the study display name. Omit to scan every visible Pine study.'),
    max_labels: z.coerce.number().optional().describe('Max labels returned per study (default 50). Only applies when kinds includes "labels". Raise if a study draws many annotations.'),
    verbose: z.coerce.boolean().optional().describe('Return raw drawing data including IDs, coordinates, colors. Default false (compact: deduplicated price levels / text+price pairs / {high,low} zones). Applies to lines, labels, boxes; tables ignore this flag.'),
  }, async ({ kinds, study_filter, max_labels, verbose }) => {
    try {
      const want = new Set(kinds && kinds.length ? kinds : ['lines', 'labels', 'tables', 'boxes']);
      const out = { success: true };
      if (want.has('lines')) out.lines = await core.getPineLines({ study_filter, verbose });
      if (want.has('labels')) out.labels = await core.getPineLabels({ study_filter, max_labels, verbose });
      if (want.has('tables')) out.tables = await core.getPineTables({ study_filter });
      if (want.has('boxes')) out.boxes = await core.getPineBoxes({ study_filter, verbose });
      return jsonResult(out);
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_get_study_values', 'Read current Data Window values for all visible studies on the active chart (including custom plot() outputs). Returns display values, not historical series or study IDs. An empty studies array is valid when no visible study exposes values.', {}, async () => {
    try { return jsonResult(await core.getStudyValues()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('data_save_ohlcv', 'Download all available OHLCV bars and save as CSV under the OHLCV/ folder. Optionally switches symbol/timeframe first, then pages in maximum history before exporting. Returns the file path and bar count.', {
    symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').optional().describe('Full SOURCE:TICKER to switch to before downloading, e.g. INDEX:BTCUSD or BINANCE:BTCUSDT. Omit to use the current chart symbol. If the source is unclear, call symbol_search first and use results[].full_name.'),
    timeframe: z.string().optional().describe('Timeframe to set before downloading (e.g., "1", "5", "60", "D"). Omit to use the current chart timeframe.'),
    max_history: z.coerce.number().optional().describe('Maximum bars to save (default: all available). The tool stops requesting older history once this is reached.'),
    max_iterations: z.coerce.number().optional().describe('Safety cap on history-load iterations (default 80). Each iteration pages in older bars.'),
    settle_ms: z.coerce.number().optional().describe('Milliseconds to wait between paginate triggers (default 800). Increase on slow connections.'),
  }, async ({ symbol, timeframe, max_history, max_iterations, settle_ms }) => {
    try { return jsonResult(await core.saveOhlcv({ symbol, timeframe, max_history, max_iterations, settle_ms })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
