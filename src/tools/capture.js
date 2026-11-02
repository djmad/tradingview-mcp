import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/capture.js';

export function registerCaptureTools(server) {
  server.tool('capture_screenshot', 'Capture the TradingView chart. CDP PNG files use MCP_SCREENSHOT_DIR (default screenshots/); the native api method uses TradingView own save UI.', {
    region: z.string().optional().describe('Region to capture: full, chart, strategy_tester (default full)'),
    filename: z.string().optional().describe('Custom filename (without extension)'),
    method: z.string().optional().describe('Capture method: cdp (Page.captureScreenshot) or api (chartWidgetCollection.takeScreenshot) (default cdp)'),
    wait_for_render: z.boolean().optional().describe('Wait for the chart canvas to stabilize before capturing. Use after chart_set_symbol or chart_set_timeframe to avoid stale frames.'),
  }, async ({ region, filename, method, wait_for_render }) => {
    try { return jsonResult(await core.captureScreenshot({ region, filename, method, waitForRender: wait_for_render })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
