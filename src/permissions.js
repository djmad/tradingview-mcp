import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(process.cwd(), '.env');

export const TOOL_CATALOG = {
  health: {
    read: ['tv_health_check', 'tv_discover', 'tv_ui_state'],
    write: ['tv_launch', 'tv_update'],
  },
  chart: {
    read: ['chart_get_state', 'chart_get_visible_range'],
    write: ['chart_set', 'chart_manage_indicator', 'add_known_indicator'],
  },
  data: {
    read: ['data_get_equity', 'data_get_indicator', 'data_get_ohlcv', 'data_get_pine_graphics', 'data_get_strategy_results', 'data_get_study_values', 'data_get_trades', 'quote_get', 'depth_get', 'symbol_info', 'symbol_search'],
    write: ['data_save_ohlcv', 'strategy_prepare'],
  },
  pine: {
    read: ['pine_list_scripts'],
    write: ['pine_edit', 'pine_new', 'pine_open'],
  },
  drawing: {
    read: ['draw_get_properties', 'draw_list'],
    write: ['draw_shape', 'draw_clear', 'draw_remove_one'],
  },
  alerts: {
    read: ['alert_list'],
    write: ['alert_create', 'alert_modify', 'alert_delete'],
  },
  news: { read: ['news_get', 'news_get_content'], write: [] },
  fundamentals: {
    read: ['symbol_data_available', 'data_get_technicals', 'data_get_financials', 'data_get_etf_profile', 'data_get_seasonals'],
    write: [],
  },
  capture: {
    read: ['capture_screenshot'],
    write: [],
  },
  indicators: {
    read: [],
    write: ['indicator_set_inputs', 'indicator_toggle_visibility', 'indicator_search', 'indicator_add'],
  },
  watchlist: {
    read: ['watchlist_get'],
    write: ['watchlist_add', 'watchlist_add_bulk', 'watchlist_remove'],
  },
  layout: {
    read: ['layout_list'],
    write: ['layout_switch', 'layout_new'],
  },
  pane: {
    read: ['pane_list'],
    write: ['pane_focus', 'pane_set_layout', 'pane_set_symbol'],
  },
  tab: {
    read: ['tab_list'],
    write: ['tab_close', 'tab_new', 'tab_switch'],
  },
  replay: {
    read: [],
    write: ['replay'],
  },
  batch: {
    read: [],
    write: ['batch_run'],
  },
  ui: {
    read: ['ui_find_element'],
    write: ['ui_click', 'ui_evaluate', 'ui_fullscreen', 'ui_hover', 'ui_keyboard', 'ui_mouse_click', 'ui_open_panel', 'ui_scroll', 'ui_type_text'],
  },
};

export function allTools() {
  const out = [];
  for (const [group, kinds] of Object.entries(TOOL_CATALOG)) {
    for (const name of kinds.read) out.push({ name, group, kind: 'read' });
    for (const name of kinds.write) out.push({ name, group, kind: 'write' });
  }
  return out;
}

export function toolKind(name) {
  for (const kinds of Object.values(TOOL_CATALOG)) {
    if (kinds.read.includes(name)) return 'read';
    if (kinds.write.includes(name)) return 'write';
  }
  return 'write';
}

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  return parseEnv(readFileSync(ENV_PATH, 'utf8'));
}

export function loadConfig() {
  const env = { ...loadEnv(), ...process.env };
  const mode = (env.MCP_PERM_MODE || 'rw').toLowerCase();
  const split = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    mode: ['read', 'rw', 'custom'].includes(mode) ? mode : 'rw',
    disabled: new Set(split(env.MCP_PERM_DISABLED)),
    enabled: new Set(split(env.MCP_PERM_ENABLED)),
  };
}

export function isToolEnabled(name, cfg) {
  if (!allTools().some(t => t.name === name)) return false;
  if (cfg.mode === 'read') {
    if (toolKind(name) !== 'read') return false;
    return !cfg.disabled.has(name);
  }
  if (cfg.mode === 'rw') {
    return !cfg.disabled.has(name);
  }
  return cfg.enabled.has(name) && !cfg.disabled.has(name);
}

export function applyPermissions(server, cfg, activity = null) {
  const original = server.tool.bind(server);
  const skipped = [];
  server.tool = (name, ...rest) => {
    if (!allTools().some(t => t.name === name)) throw new Error(`Tool missing from permission catalog: ${name}`);
    if (!isToolEnabled(name, cfg)) {
      skipped.push(name);
      return { remove: () => {}, update: () => {}, enable: () => {}, disable: () => {} };
    }
    const callbackIndex = rest.findLastIndex((value) => typeof value === 'function');
    if (callbackIndex >= 0) {
      const callback = rest[callbackIndex];
      rest[callbackIndex] = async (...args) => {
        if (!isToolEnabled(name, loadConfig())) {
          return { isError: true, content: [{ type: 'text', text: `Permission denied: ${name}` }] };
        }
        const callId = activity?.toolStarted(name);
        try {
          const result = await callback(...args);
          const toolError = result?.isError ? new Error('Tool returned an MCP error result') : null;
          activity?.toolFinished(callId, toolError);
          return result;
        } catch (error) {
          activity?.toolFinished(callId, error);
          throw error;
        }
      };
    }
    return original(name, ...rest);
  };
  return { skipped };
}

export function saveEnv(updates) {
  let existing = {};
  let raw = '';
  if (existsSync(ENV_PATH)) {
    raw = readFileSync(ENV_PATH, 'utf8');
    existing = parseEnv(raw);
  }
  const merged = { ...existing, ...updates };
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(merged, m[1])) {
      out.push(`${m[1]}=${merged[m[1]]}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(merged)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  writeFileSync(ENV_PATH, out.join('\n') + '\n');
}

export function configToEnv(cfg) {
  return {
    MCP_PERM_MODE: cfg.mode,
    MCP_PERM_DISABLED: [...cfg.disabled].join(','),
    MCP_PERM_ENABLED: [...cfg.enabled].join(','),
  };
}

// Preserve the effective selection when entering Custom; never grant extra tools.
export function setPermissionMode(cfg, mode) {
  if (!['read', 'rw', 'custom'].includes(mode)) throw new Error('Invalid permission mode');
  const selected = allTools().filter(t => isToolEnabled(t.name, cfg)).map(t => t.name);
  cfg.mode = mode;
  if (mode === 'custom') {
    cfg.enabled = new Set(selected);
    cfg.disabled = new Set();
  }
}
