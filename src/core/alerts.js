/**
 * Core alert logic.
 *
 * Primary path: POST to https://pricealerts.tradingview.com/create_alert directly
 * (reverse-engineered from a live trace of the TV web client). The browser session's
 * cookies authenticate the request — no token plumbing needed.
 *
 * Fallback: legacy DOM dialog automation, kept for builds where the REST shape
 * changes or cookies are missing.
 */
import { evaluate, evaluateAsync, getClient, safeString } from '../connection.js';

// Map our public condition names to TV's internal `type` strings.
// Discovered from create_alert payload trace.
const CONDITION_MAP = {
  crossing:      'cross',
  cross:         'cross',
  crossing_up:   'cross_up',
  cross_up:      'cross_up',
  crossing_down: 'cross_down',
  cross_down:    'cross_down',
  greater_than:  'greater',
  greater:       'greater',
  less_than:     'less',
  less:          'less',
  entering_channel: 'in_channel',
  exiting_channel:  'out_channel',
};

/**
 * Create an alert.
 *
 * @param {object} opts
 * @param {string} opts.condition  e.g. 'crossing', 'crossing_up', 'greater_than'
 * @param {number} opts.price      price level
 * @param {string} [opts.message]  alert message body (template vars like {{close}} allowed)
 * @param {string} [opts.name]     short alert title (shown in alert list)
 * @param {string} [opts.symbol]   override chart's current symbol (e.g. "TVC:GOLD")
 * @param {string} [opts.resolution] alert evaluation resolution, default "1"
 * @param {boolean} [opts.popup=true]
 * @param {boolean} [opts.email=false]
 * @param {boolean} [opts.mobile_push=true]
 * @param {boolean} [opts.sms_over_email=false]
 * @param {string|null} [opts.web_hook=null]
 * @param {string} [opts.sound_file='alert/3_notes_reverb']
 * @param {number} [opts.sound_duration=10]
 * @param {string} [opts.expiration] ISO timestamp; default = end of today UTC
 */
export async function create(opts) {
  const direct = await tryDirectCreate(opts);
  if (direct?.success) return direct;
  // Fall back to DOM only if REST failed for an unexpected reason.
  const dom = await createViaDom(opts);
  return { ...dom, direct_api_error: direct?.error };
}

async function tryDirectCreate({
  condition,
  price,
  message,
  name,
  symbol,
  resolution = '1',
  popup = true,
  email = false,
  mobile_push = true,
  sms_over_email = false,
  web_hook = null,
  sound_file = 'alert/3_notes_reverb',
  sound_duration = 10,
  expiration,
}) {
  try {
    const condType = CONDITION_MAP[String(condition).toLowerCase()] || 'cross';
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum)) {
      return { success: false, error: `price must be finite, got ${price}` };
    }

    // End-of-day UTC default expiration to mirror TV web's "until end of day"
    if (!expiration) {
      const d = new Date();
      d.setUTCHours(21, 59, 59, 999);
      // If we're already past 22:00 UTC, push to tomorrow's 21:59
      if (d.getTime() < Date.now()) d.setUTCDate(d.getUTCDate() + 1);
      expiration = d.toISOString();
    }

    const payload = {
      // The TV web client wraps symbol as: ={"currency-id":"USD","symbol":"TVC:GOLD"}
      // The minimal form ={"symbol":"TVC:GOLD"} is accepted; TV fills in the rest.
      symbol: '=' + JSON.stringify({ symbol: symbol || '__USE_CHART_SYMBOL__' }),
      resolution: String(resolution),
      message: message || (name || `${(symbol || '').replace(/^[A-Z]+:/, '')} ${condType} ${priceNum}`),
      sound_file,
      sound_duration,
      popup,
      expiration,
      auto_deactivate: false,
      email,
      sms_over_email,
      mobile_push,
      web_hook,
      name: name || '',
      conditions: [{
        type: condType,
        frequency: 'on_first_fire',
        series: [{ type: 'barset' }, { type: 'value', value: priceNum }],
        resolution: String(resolution),
      }],
      active: true,
      ignore_warnings: true,
    };

    // Resolve symbol from chart inside the page if caller didn't supply one,
    // so our request matches what the user sees on screen.
    const result = await evaluateAsync(`
      (async function() {
        try {
          var payload = ${JSON.stringify(payload)};
          if (payload.symbol.indexOf('__USE_CHART_SYMBOL__') !== -1) {
            try {
              var chart = window.TradingViewApi._activeChartWidgetWV.value();
              var s = chart.symbol();
              if (!s || typeof s !== 'string') {
                return { ok: false, error: 'chart.symbol() returned: ' + JSON.stringify(s) };
              }
              payload.symbol = '=' + JSON.stringify({ symbol: s });
            } catch (e) {
              return { ok: false, error: 'could not resolve chart symbol: ' + (e && e.message || e) };
            }
          }
          // Match TV web client exactly: no Content-Type header (avoids CORS preflight),
          // include log_username/build_time query params it sends.
          var qs = '?log_username=mcp&maintenance_unset_reason=initial_operated&build_time=' + encodeURIComponent(new Date().toISOString());
          var url = 'https://pricealerts.tradingview.com/create_alert' + qs;
          var res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ payload: payload })
          });
          var text = await res.text();
          var data;
          try { data = JSON.parse(text); } catch (e) { return { ok: false, status: res.status, raw: text.slice(0, 500) }; }
          if (data.s !== 'ok') return { ok: false, status: res.status, response: data };
          return { ok: true, alert: data.r, id: data.id };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      })()
    `);

    if (result?.ok) {
      return {
        success: true,
        source: 'direct_api',
        alert_id: result.alert?.alert_id,
        symbol: parseSymbol(result.alert?.symbol),
        price: priceNum,
        condition: condType,
        message: payload.message,
        name: payload.name || '(none)',
        active: result.alert?.active,
        expiration: result.alert?.expiration,
      };
    }
    return {
      success: false,
      source: 'direct_api',
      error: result?.error || result?.response?.errmsg || `create_alert returned status ${result?.status}`,
      response: result?.response,
    };
  } catch (err) {
    return { success: false, source: 'direct_api', error: err.message };
  }
}

function parseSymbol(s) {
  if (!s) return null;
  try { return JSON.parse(String(s).replace(/^=/, ''))?.symbol || s; } catch { return s; }
}

/**
 * Modify an existing alert. Fetches the current alert state, applies the supplied
 * changes, and POSTs to /modify_restart_alert (which TV calls when you click Save
 * in the edit dialog — it also restarts a stopped/triggered alert).
 *
 * @param {object} opts
 * @param {number} opts.alert_id   Required.
 * @param {number} [opts.price]    New price level (replaces the value in conditions[0].series[1]).
 * @param {string} [opts.condition] New condition type (mapped via CONDITION_MAP).
 * @param {string} [opts.message]
 * @param {string} [opts.name]
 * @param {string} [opts.symbol]    New symbol — pass plain "TVC:GOLD"; we wrap it.
 * @param {string} [opts.resolution]
 * @param {boolean} [opts.popup]
 * @param {boolean} [opts.email]
 * @param {boolean} [opts.mobile_push]
 * @param {boolean} [opts.sms_over_email]
 * @param {string|null} [opts.web_hook]
 * @param {boolean} [opts.active]
 * @param {string|null} [opts.expiration]
 * @param {boolean} [opts.auto_deactivate]
 */
export async function modify(opts) {
  const id = Number(opts.alert_id);
  if (!Number.isFinite(id)) {
    return { success: false, error: 'alert_id is required and must be numeric' };
  }
  const overrides = { ...opts };
  delete overrides.alert_id;

  // Translate condition into TV's internal type before sending to the page.
  if (overrides.condition) {
    const t = CONDITION_MAP[String(overrides.condition).toLowerCase()];
    if (!t) return { success: false, error: `unknown condition "${overrides.condition}"` };
    overrides.__condType = t;
  }
  // Wrap a bare symbol like "TVC:GOLD" into TV's "=" + JSON form, leave wrapped values alone.
  if (overrides.symbol && !overrides.symbol.startsWith('=')) {
    overrides.__symbolWrapped = '=' + JSON.stringify({ symbol: overrides.symbol });
  }

  const result = await evaluateAsync(`
    (async function() {
      try {
        var listRes = await fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' });
        var listData = await listRes.json();
        if (listData.s !== 'ok' || !Array.isArray(listData.r)) return { ok: false, error: 'list_alerts failed' };
        var current = listData.r.find(function(a){ return a.alert_id === ${id}; });
        if (!current) return { ok: false, error: 'alert_id ${id} not found' };

        var ov = ${JSON.stringify(overrides)};
        var cond = (current.conditions && current.conditions[0]) || current.condition;
        if (!cond) return { ok: false, error: 'current alert has no condition' };

        // Build the modify payload with current state; override fields the caller passed.
        var payload = {
          symbol: ov.__symbolWrapped || current.symbol,
          resolution: ov.resolution != null ? String(ov.resolution) : current.resolution,
          message: ov.message != null ? ov.message : current.message,
          sound_file: ov.sound_file != null ? ov.sound_file : (current.sound_file || 'alert/3_notes_reverb'),
          sound_duration: ov.sound_duration != null ? ov.sound_duration : (current.sound_duration || 10),
          popup: ov.popup != null ? !!ov.popup : !!current.popup,
          expiration: ov.expiration !== undefined ? ov.expiration : (current.expiration || null),
          auto_deactivate: ov.auto_deactivate != null ? !!ov.auto_deactivate : !!current.auto_deactivate,
          email: ov.email != null ? !!ov.email : !!current.email,
          sms_over_email: ov.sms_over_email != null ? !!ov.sms_over_email : !!current.sms_over_email,
          mobile_push: ov.mobile_push != null ? !!ov.mobile_push : !!current.mobile_push,
          web_hook: ov.web_hook !== undefined ? ov.web_hook : (current.web_hook || null),
          name: ov.name != null ? ov.name : (current.name || ''),
          conditions: [{
            type: ov.__condType || cond.type,
            frequency: cond.frequency || 'on_first_fire',
            series: [
              { type: 'barset' },
              { type: 'value', value: ov.price != null ? Number(ov.price) : (cond.series && cond.series[1] ? cond.series[1].value : null) }
            ],
            resolution: ov.resolution != null ? String(ov.resolution) : (cond.resolution || current.resolution),
          }],
          active: ov.active != null ? !!ov.active : true,
          ignore_warnings: true,
          alert_id: ${id},
          client_id: 'update_' + Date.now() + '_' + Date.now(),
        };

        var qs = '?log_username=mcp&maintenance_unset_reason=initial_operated&build_time=' + encodeURIComponent(new Date().toISOString());
        var res = await fetch('https://pricealerts.tradingview.com/modify_restart_alert' + qs, {
          method: 'POST', credentials: 'include',
          body: JSON.stringify({ payload: payload })
        });
        var text = await res.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { return { ok: false, status: res.status, raw: text.slice(0, 500) }; }
        if (data.s !== 'ok') return { ok: false, status: res.status, response: data };
        return { ok: true, alert: data.r };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()
  `);

  if (result?.ok) {
    const a = result.alert || {};
    const c = (a.conditions && a.conditions[0]) || a.condition || {};
    return {
      success: true,
      source: 'direct_api',
      alert_id: a.alert_id,
      symbol: parseSymbol(a.symbol),
      price: c.series && c.series[1] && c.series[1].value,
      condition: c.type,
      message: a.message,
      name: a.name || '(none)',
      active: a.active,
    };
  }
  return {
    success: false,
    source: 'direct_api',
    alert_id: id,
    error: result?.error || result?.response?.errmsg || `modify_restart_alert returned status ${result?.status}`,
    response: result?.response,
  };
}

// ─── Legacy DOM fallback (kept for resilience if REST shape ever changes) ─────

const FIND_DIALOG_FN = `
  function __findAlertDialog() {
    var direct = document.querySelector('[data-name="alerts-create-edit-dialog"]')
      || document.querySelector('[data-dialog-name*="alert" i]')
      || document.querySelector('[data-name*="alerts-create" i]');
    if (direct) return direct;
    var candidates = document.querySelectorAll('[role="dialog"], [data-name*="dialog" i], [class*="Dialog" i]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') continue;
      var txt = (el.textContent || '').slice(0, 300);
      if (/create\\s+alert/i.test(txt) && el.querySelector('input')) return el;
    }
    return null;
  }
`;

async function createViaDom({ condition, price, message }) {
  const steps = { triggered: false, dialog_opened: false, price_set: false, message_set: false, submitted: false };

  steps.triggered = await evaluate(`
    (function() {
      var sel = ['[aria-label="Create alert" i]', '[data-name="header-toolbar-alert"]', '[data-name="alerts-create"]'];
      for (var i = 0; i < sel.length; i++) {
        var el = document.querySelector(sel[i]);
        if (el) { el.click(); return true; }
      }
      return false;
    })()
  `);

  if (!steps.triggered) {
    const client = await getClient();
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp',   modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    steps.triggered = true;
  }

  steps.dialog_opened = await evaluateAsync(`
    (async function() {
      ${FIND_DIALOG_FN}
      for (var i = 0; i < 25; i++) {
        var d = __findAlertDialog();
        if (d && d.querySelector('input')) return true;
        await new Promise(function(r){ setTimeout(r, 200); });
      }
      return false;
    })()
  `);

  if (!steps.dialog_opened) {
    return { success: false, source: 'dom_fallback', steps, error: 'Create-alert dialog did not open' };
  }

  steps.price_set = await evaluate(`
    (function() {
      ${FIND_DIALOG_FN}
      var dlg = __findAlertDialog();
      if (!dlg) return false;
      var input = dlg.querySelector('input[inputmode="decimal"]') || dlg.querySelector('input[type="number"]') || dlg.querySelector('input[type="text"]');
      if (!input) return false;
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${safeString(String(price))});
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      return true;
    })()
  `);

  if (message) {
    steps.message_set = await evaluate(`
      (function() {
        ${FIND_DIALOG_FN}
        var dlg = __findAlertDialog();
        if (!dlg) return false;
        var ta = dlg.querySelector('textarea');
        if (!ta) return false;
        var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(message)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
  }

  await new Promise(r => setTimeout(r, 300));

  steps.submitted = await evaluate(`
    (function() {
      ${FIND_DIALOG_FN}
      var dlg = __findAlertDialog();
      if (!dlg) return false;
      var primary = dlg.querySelector('button[data-name="submit"], button[data-name="create-button"], button[type="submit"]');
      if (primary) { primary.click(); return true; }
      var btns = dlg.querySelectorAll('button');
      var rx = /^(create|erstellen|créer|crear|criar|создать|作成|创建)$/i;
      for (var i = 0; i < btns.length; i++) {
        if (rx.test(btns[i].textContent.trim())) { btns[i].click(); return true; }
      }
      return false;
    })()
  `);

  await new Promise(r => setTimeout(r, 400));
  const verify = await evaluate(`
    (function() {
      ${FIND_DIALOG_FN}
      var dlg = __findAlertDialog();
      return dlg ? { still_open: true } : { still_open: false };
    })()
  `);

  return {
    success: steps.submitted && !verify.still_open,
    price, condition, message: message || '(none)',
    source: 'dom_fallback',
    steps,
    ...(verify.still_open ? { error: 'Dialog did not close after submit' } : {}),
  };
}

export async function list() {
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ alert_id, alert_ids, delete_all }) {
  // Accept either a single alert_id or a list. Endpoint supports batch.
  const ids = alert_ids
    ? (Array.isArray(alert_ids) ? alert_ids : [alert_ids]).map(Number)
    : (alert_id != null ? [Number(alert_id)] : null);
  if (ids && ids.length) {
    if (ids.some(n => !Number.isFinite(n))) {
      return { success: false, error: 'alert_id(s) must be numeric' };
    }
    const result = await evaluateAsync(`
      (async function() {
        try {
          var qs = '?log_username=mcp&maintenance_unset_reason=initial_operated&build_time=' + encodeURIComponent(new Date().toISOString());
          var res = await fetch('https://pricealerts.tradingview.com/delete_alerts' + qs, {
            method: 'POST', credentials: 'include',
            body: JSON.stringify({ payload: { alert_ids: ${JSON.stringify(ids)} } })
          });
          var text = await res.text();
          try { return JSON.parse(text); } catch(e) { return { s: 'error', errmsg: 'non-json: ' + text.slice(0, 300) }; }
        } catch (e) { return { s: 'error', errmsg: String(e && e.message || e) }; }
      })()
    `);
    if (result?.s === 'ok') return { success: true, source: 'direct_api', deleted: ids };
    return { success: false, source: 'direct_api', deleted: [], requested: ids, error: result?.errmsg || 'delete_alerts failed', response: result };
  }
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Provide alert_id or delete_all=true.');
}
