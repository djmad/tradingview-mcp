import { z } from 'zod';
import { booleanParam } from './_schema.js';
import { jsonResult } from './_format.js';
import * as core from '../core/pine.js';

export function registerPineTools(server) {
  server.tool('pine_edit', 'Pine Script editor dispatcher — single tool for all editor operations on the currently open script. Actions: "get_source" reads the current code from Monaco (WARNING: complex scripts can exceed 200KB — avoid unless editing); "set_source" injects new code into the editor (requires source); "compile" clicks the Add-to-Chart / compile button; "smart_compile" detects the right button, compiles, polls for errors, and reports any new study added to the chart (preferred over plain compile); "get_errors" reads Monaco diagnostic markers (compilation errors and warnings); "get_console" reads runtime/log output (log.info, log.warning, compile messages); "save" persists the script to TradingView cloud (Ctrl+S equivalent); "check" sends provided source to TradingView\'s server-side compile API and returns errors/warnings WITHOUT touching the editor or chart (requires source); "analyze" runs an offline static analyzer on provided source — catches array out-of-bounds, unguarded array.first()/last(), bad loop bounds, implicit bool casts (requires source, no TradingView connection needed). Typical workflow: set_source → smart_compile → get_errors → save.', {
    action: z.enum(['get_source', 'set_source', 'compile', 'smart_compile', 'get_errors', 'get_console', 'save', 'check', 'analyze']).describe('Editor action: get_source | set_source | compile | smart_compile | get_errors | get_console | save | check | analyze'),
    allow_title_mismatch: booleanParam().optional().describe('Only for save/compile: explicitly permit updating a saved script whose name differs from the source declaration title.'),
    source: z.string().optional().describe('Pine Script source code. REQUIRED for set_source (injected into editor), check (server-side validated), analyze (offline-validated). Ignored by other actions.'),
  }, async ({ action, source, allow_title_mismatch }) => {
    try {
      switch (action) {
        case 'get_source': return jsonResult(await core.getSource());
        case 'set_source':
          if (source === undefined) return jsonResult({ success: false, error: 'action=set_source requires source' }, true);
          return jsonResult(await core.setSource({ source }));
        case 'compile': return jsonResult(await core.compile({ allowTitleMismatch: allow_title_mismatch }));
        case 'smart_compile': return jsonResult(await core.smartCompile({ allowTitleMismatch: allow_title_mismatch }));
        case 'get_errors': return jsonResult(await core.getErrors());
        case 'get_console': return jsonResult(await core.getConsole());
        case 'save': return jsonResult(await core.save({ allowTitleMismatch: allow_title_mismatch }));
        case 'check':
          if (source === undefined) return jsonResult({ success: false, error: 'action=check requires source' }, true);
          return jsonResult(await core.check({ source }));
        case 'analyze':
          if (source === undefined) return jsonResult({ success: false, error: 'action=analyze requires source' }, true);
          return jsonResult(core.analyze({ source }));
      }
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('pine_new', 'Create a new unsaved Pine Script through the editor menu, verifying a new model binding. Refuses to overwrite source in the currently bound script or discard unsaved changes.', {
    type: z.enum(['indicator', 'strategy', 'library']).describe('Type of script to create'),
  }, async ({ type }) => {
    try { return jsonResult(await core.newScript({ type })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('pine_open', 'Open one uniquely matched saved script through the editor UI and verify its new model binding. Refuses to inject its source into a different script or discard unsaved changes.', {
    name: z.string().describe('Name of the saved script to open (case-insensitive match)'),
  }, async ({ name }) => {
    try { return jsonResult(await core.openScript({ name })); }
    catch (err) { return jsonResult({ success: false, source: 'internal_api', error: err.message }, true); }
  });

  server.tool('pine_list_scripts', 'Read metadata for all Pine Scripts saved to the signed-in TradingView account. It does not return script source or open the editor. Output can be very large; inspect count and error because an empty list may represent an API limitation.', {}, async () => {
    try { return jsonResult(await core.listScripts()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
