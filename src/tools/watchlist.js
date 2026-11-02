import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/watchlist.js';

export function registerWatchlistTools(server) {
  server.tool('watchlist_get', 'Read rows currently rendered in the active TradingView watchlist panel, including SOURCE:TICKER symbol when exposed, last price and change. The panel must be open/rendered; panel_closed with count=0 does not prove the saved watchlist is empty.', {}, async () => {
    try { return jsonResult(await core.get()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('watchlist_add', 'Add a symbol to the TradingView watchlist', {
    symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').describe('Full SOURCE:TICKER, e.g. NASDAQ:AAPL, INDEX:BTCUSD, CME_MINI:ES1! or NYMEX:CL1!. If the source is unclear, call symbol_search first and use results[].full_name.'),
  }, async ({ symbol }) => {
    try { return jsonResult(await core.add({ symbol })); }
    catch (err) {
      // Try to close any open search/input on error
      try {
        const { getClient } = await import('../connection.js');
        const c = await getClient();
        await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      } catch (_) {}
      return jsonResult({ success: false, error: err.message }, true);
    }
  });

  server.tool('watchlist_add_bulk', 'Add multiple symbols to the TradingView watchlist', {
    symbols: z.array(z.string()).describe('Symbols to add (e.g., ["AAPL", "ES1!", "NYMEX:CL1!"])'),
  }, async ({ symbols }) => {
    try { return jsonResult(await core.addBulk({ symbols })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('watchlist_remove', 'Remove one or more symbols from the active TradingView watchlist', {
    symbols: z.array(z.string()).describe('Symbols to remove — bare (AAPL) or full (NASDAQ:AAPL)'),
  }, async ({ symbols }) => {
    try { return jsonResult(await core.remove({ symbols })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
