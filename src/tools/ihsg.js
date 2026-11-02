import { z } from 'zod';
import { booleanParam } from './_schema.js';
import { jsonResult } from './_format.js';
import { ihsgScreen } from '../core/ihsg.js';
import { CRITERIA } from '../../screener/analysis.js';

export function registerIhsgTools(server) {
  server.tool('IHSG_Screen', 'Screen a resumable batch from the static PR511 IHSG/IDX universe with daily pivot/Fibonacci/pattern/volume heuristics. Temporarily switches this MCP session-selected chart, then verifies restoration of symbol, timeframe and exact logical viewport. Writes batch-only JSON/Markdown/XLSX reports by default; repeat next_cursor to cover the known snapshot universe. Does not launch TradingView, schedule jobs, trade, or claim current membership.', {
    symbols: z.array(z.string().regex(/^IDX:[A-Z0-9]{1,12}$/)).min(1).max(1000).optional().describe('Optional unique exact IDX:TICKER symbols; omit for the 951-symbol PR511 snapshot (membership as-of unknown).'),
    cursor: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional().describe('Opaque next_cursor from the preceding batch with the same symbols, criteria and liquidity threshold.'),
    limit: z.number().int().min(1).max(10).optional().describe('Maximum symbols in this call (default 5). Full-universe scans use repeated bounded batches.'),
    timeout_ms: z.number().int().min(1000).max(45000).optional().describe('Scan work budget (default 30000 ms); a further bounded cleanup budget is reserved for restoration.'),
    min_avg_value_trx_50d: z.number().finite().min(0).max(1e15).optional().describe('Minimum average 50-day price × volume in Rupiah (default 1e9). This is a configurable rule, not a suitability assessment.'),
    criteria: z.array(z.enum(CRITERIA)).min(1).max(CRITERIA.length).optional().describe('Optional distinct detector keys. Omit to run all 12 PR511 bullish setup heuristics.'),
    export_reports: booleanParam().optional().describe('Write batch-only JSON, Markdown and XLSX files under ignored .local/ihsg (default true). No arbitrary output path is accepted.'),
  }, async args => {
    try { return jsonResult(await ihsgScreen(args)); }
    catch (error) {
      if (error.code === 'IHSG_UNVERIFIABLE_STRUCTURE') return jsonResult({ success: false, status: 'preflight_refused', chart_changes_dispatched: false, error: 'An unnamed, unready or unidentifiable existing study/drawing prevents a safe scan. Reconcile it manually; no study was classified as disposable or removed.' }, true);
      return jsonResult({ success: false, error: 'IHSG scan could not initialize; no result or restoration was verified. Check parameters and the selected chart.' }, true); }
  });
}
