import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/pane.js';

export function registerPaneTools(server) {
  server.tool('pane_list', 'Read panes in the current layout, including layout code/name, chart count, active_index and each pane symbol/state. Pane indices are 0-based and ephemeral; call again after any layout change before using an index.', {}, async () => {
    try { return jsonResult(await core.list()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('pane_set_layout', 'Change the chart grid layout (e.g., single, 2x2, 2h, 3v)', {
    layout: z.string().describe('Layout code: s (single), 2h, 2v, 2-1, 1-2, 3h, 3v, 4 (2x2), 6, 8. Also accepts: single, 2x1, 1x2, 2x2, quad'),
  }, async ({ layout }) => {
    try { return jsonResult(await core.setLayout({ layout })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('pane_focus', 'Focus a specific chart pane by index (0-based)', {
    index: z.coerce.number().describe('Pane index (0-based, from pane_list)'),
  }, async ({ index }) => {
    try { return jsonResult(await core.focus({ index })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('pane_set_symbol', 'Set the symbol on a specific pane by index', {
    index: z.coerce.number().describe('Pane index (0-based)'),
    symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').describe('Full SOURCE:TICKER, e.g. CME_MINI:NQ1!, CME_MINI:ES1! or NASDAQ:AAPL. If the source is unclear, call symbol_search first and use results[].full_name.'),
  }, async ({ index, symbol }) => {
    try { return jsonResult(await core.setSymbol({ index, symbol })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
