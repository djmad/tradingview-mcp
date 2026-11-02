import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/capture.js';

export function registerCaptureTools(server) {
  server.tool('capture_screenshot', 'Capture the current TradingView window and write a PNG to the project screenshots folder. Although permission-classified as read, this creates a local file. chart and strategy_tester regions may fall back to a full-window capture when bounds are unavailable; method=api may interact with TradingView screenshot UI.', {
    region: z.enum(['full', 'chart', 'strategy_tester']).optional().describe('Region to request (default full). A missing region boundary can fall back to full.'),
    filename: z.string().optional().describe('Safe custom basename without extension; the result returns the actual path.'),
    method: z.enum(['cdp', 'api']).optional().describe('cdp captures through DevTools (default); api uses TradingView screenshot behavior and can fall back to CDP.'),
  }, async ({ region, filename, method }) => {
    try { return jsonResult(await core.captureScreenshot({ region, filename, method })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
