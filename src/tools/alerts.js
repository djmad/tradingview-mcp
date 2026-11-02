import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/alerts.js';

export function registerAlertTools(server) {
  server.tool('alert_create',
    'Create a price alert via the TradingView pricealerts REST API. Reads cookies from the live browser session, so no token plumbing is needed. Falls back to DOM dialog automation if the REST call fails.',
    {
      condition: z.string().describe('Condition: "crossing" | "crossing_up" | "crossing_down" | "greater_than" | "less_than" | "entering_channel" | "exiting_channel"'),
      price: z.coerce.number().describe('Price level for the alert'),
      message: z.string().optional().describe('Alert message body. Supports TV template vars like {{close}}, {{ticker}}, {{interval}}.'),
      name: z.string().optional().describe('Short alert title shown in the alert list (defaults to empty).'),
      symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').optional().describe('Override symbol in SOURCE:TICKER form, e.g. TVC:GOLD or INDEX:BTCUSD. Defaults to the active chart symbol. If the source is unclear, call symbol_search first and use results[].full_name.'),
      resolution: z.string().optional().describe('Alert evaluation resolution. Default "1" (1-minute) — TV web uses this for price alerts regardless of chart timeframe.'),
      popup: z.coerce.boolean().optional().describe('Show desktop popup on fire (default true).'),
      email: z.coerce.boolean().optional().describe('Send email on fire (default false).'),
      mobile_push: z.coerce.boolean().optional().describe('Send mobile push on fire (default true).'),
      sms_over_email: z.coerce.boolean().optional().describe('Send SMS-via-email on fire (default false).'),
      web_hook: z.string().nullable().optional().describe('Webhook URL to POST on fire (default null).'),
      sound_file: z.string().optional().describe('Sound file id (default "alert/3_notes_reverb").'),
      sound_duration: z.coerce.number().optional().describe('Sound duration in seconds (default 10).'),
      expiration: z.string().optional().describe('ISO timestamp when alert auto-expires. Default = end of today UTC.'),
    },
    async (args) => {
      try { return jsonResult(await core.create(args)); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    });

  server.tool('alert_modify',
    'Edit an existing alert via the TradingView modify_restart_alert REST endpoint. Pass alert_id plus only the fields you want to change — current values are preserved for everything else. Submitting also restarts a stopped/triggered alert.',
    {
      alert_id: z.coerce.number().describe('ID of the alert to modify (from alert_list).'),
      price: z.coerce.number().optional().describe('New price level.'),
      condition: z.string().optional().describe('New condition: "crossing" | "crossing_up" | "crossing_down" | "greater_than" | "less_than".'),
      message: z.string().optional().describe('New alert message body.'),
      name: z.string().optional().describe('New short title.'),
      symbol: z.string().regex(/^[^:\s]+:[^:\s]+$/, 'Use SOURCE:TICKER').optional().describe('New symbol in SOURCE:TICKER form, e.g. NYSE:AI or XETR:SIE. If the source is unclear, call symbol_search first and use results[].full_name.'),
      resolution: z.string().optional().describe('New evaluation resolution (e.g. "1", "5", "60", "1D").'),
      popup: z.coerce.boolean().optional(),
      email: z.coerce.boolean().optional(),
      mobile_push: z.coerce.boolean().optional(),
      sms_over_email: z.coerce.boolean().optional(),
      web_hook: z.string().nullable().optional(),
      active: z.coerce.boolean().optional().describe('Set to false to deactivate the alert without deleting.'),
      expiration: z.string().nullable().optional().describe('ISO timestamp; pass null to remove expiration.'),
      auto_deactivate: z.coerce.boolean().optional(),
    },
    async (args) => {
      try { return jsonResult(await core.modify(args)); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    });

  server.tool('alert_list', 'Read price alerts for the signed-in TradingView account through its internal API. Output can be large and may include alert_id, SOURCE:TICKER symbol, condition/type, message, active state, resolution, timestamps and expiration. Inspect count and error; an empty list is valid.', {}, async () => {
    try { return jsonResult(await core.list()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('alert_delete',
    'Delete one or more alerts by ID via the TradingView delete_alerts REST endpoint. Pass a single alert_id, an alert_ids array for batch, or delete_all=true to open the manual bulk-delete UI.',
    {
      alert_id: z.coerce.number().optional().describe('Single alert_id (from alert_list) to delete.'),
      alert_ids: z.array(z.coerce.number()).optional().describe('Batch — array of alert_ids to delete in one call.'),
      delete_all: z.coerce.boolean().optional().describe('If true, opens context menu for manual bulk deletion (legacy fallback).'),
    },
    async ({ alert_id, alert_ids, delete_all }) => {
      try { return jsonResult(await core.deleteAlerts({ alert_id, alert_ids, delete_all })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    });
}
