import { z } from 'zod';
import { booleanParam } from './_schema.js';
import { jsonResult } from './_format.js';
import * as core from '../core/health.js';
import { update } from '../core/update.js';

export function registerHealthTools(server) {
  server.tool('tv_health_check', 'Use first to verify the CDP connection and identify the active TradingView chart target/state. Read-only: it does not launch TradingView, switch tabs or change the chart. A failed response means chart-dependent tools should not be called yet.', {}, async () => {
    try { return jsonResult(await core.healthCheck()); }
    catch (err) { return jsonResult({ success: false, error: err.message, hint: 'TradingView is not running with CDP enabled. Use the tv_launch tool to start it automatically.' }, true); }
  });

  server.tool('tv_discover', 'Diagnostic read of known internal TradingView API paths and available methods. Use when a core tool fails after a successful health check; this reports capabilities, not market data, and may be version-dependent.', {}, async () => {
    try { return jsonResult(await core.discover()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tv_ui_state', 'Read a detailed, potentially large snapshot of visible TradingView UI controls and open panels. Use before UI automation to learn current labels and enabled/disabled state; it does not click or open anything.', {}, async () => {
    try { return jsonResult(await core.uiState()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tv_launch', 'Launch TradingView Desktop with Chrome DevTools Protocol (remote debugging) enabled. Auto-detects install location on Mac, Windows, and Linux, including Windows MSIX/Store installs. If a Store install blocks the debug port, automatically relaunches from a local package copy (result then includes msix_local_copy: true; the first fallback launch copies ~330MB one time, so it can take a minute).', {
    port: z.coerce.number().optional().describe('CDP port (default 9222)'),
    kill_existing: booleanParam().optional().describe('Kill existing TradingView instances first (default true)'),
  }, async ({ port, kill_existing }) => {
    try { return jsonResult(await core.launch({ port, kill_existing })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tv_update', 'Update this MCP server to the latest version: git fast-forward of origin/main + npm ci when dependencies changed. Safe by design — refuses on non-git installs, dirty working trees, non-main branches, or diverged history. After a successful update the MCP server must be restarted to load the new code.', {}, async () => {
    try { return jsonResult(await update({})); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
