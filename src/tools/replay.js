import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/replay.js';

export function registerReplayTools(server) {
  server.tool('replay', 'Control TradingView bar replay mode (back-testing by stepping through historical bars). Single dispatcher for all replay actions: "start" enters replay mode, optionally jumping to a date; "step" advances one bar forward; "autoplay" toggles automatic stepping and optionally sets speed; "stop" exits replay and returns to realtime; "trade" executes a paper buy/sell/close at the current replay bar; "status" reports current replay date, position, and P&L. Typical workflow: start → autoplay or step loop → trade → status → stop.', {
    action: z.enum(['start', 'step', 'autoplay', 'stop', 'trade', 'status']).describe('Replay action: start | step | autoplay | stop | trade | status'),
    date: z.string().optional().describe('Used by action=start. Date YYYY-MM-DD (UTC midnight) or exact ISO 8601 with explicit Z/offset, e.g. 2026-03-15T09:30:00+01:00. Mutually exclusive with timestamp. Omit both to use the earliest available bar.'),
    timestamp: z.number().finite().min(-62135596800).max(253402300799.999).optional().describe('Used by action=start. Unix seconds, including optional millisecond fraction; never milliseconds. Mutually exclusive with date. Selection is aligned by TradingView to the available chart bar.'),
    speed: z.coerce.number().optional().describe('Used by action=autoplay. Delay between bars in milliseconds — lower = faster. Valid values: 100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000. Omit to just toggle autoplay on/off without changing speed.'),
    trade_action: z.enum(['buy', 'sell', 'close']).optional().describe('Used by action=trade. "buy" opens/adds long, "sell" opens/adds short, "close" flattens the current position. Required when action=trade.'),
  }, async ({ action, date, timestamp, speed, trade_action }) => {
    try {
      switch (action) {
        case 'start': return jsonResult(await core.start({ date, timestamp }));
        case 'step': return jsonResult(await core.step());
        case 'autoplay': return jsonResult(await core.autoplay({ speed }));
        case 'stop': return jsonResult(await core.stop());
        case 'trade':
          if (!trade_action) return jsonResult({ success: false, error: 'action=trade requires trade_action (buy|sell|close)' }, true);
          return jsonResult(await core.trade({ action: trade_action }));
        case 'status': return jsonResult(await core.status());
      }
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
