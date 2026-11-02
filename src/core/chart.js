/**
 * Core chart control logic.
 */
import { evaluate as _evaluate, evaluateAsync as _evaluateAsync, safeString, requireFinite } from '../connection.js';
import { waitForChartReady as _waitForChartReady } from '../wait.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

export const KNOWN_INDICATORS = Object.freeze({
  'MAExp@tv-basicstudies-274': {
    title: 'Moving Average Exponential',
    studyName: 'MAExp@tv-basicstudies-274',
    signature: 'ssv1=undefined(9|close)',
    addMethod: 'api',
  },
  'Volume@tv-basicstudies-274': {
    title: 'Volume',
    studyName: 'Volume@tv-basicstudies-274',
    signature: 'ssv1=undefined(20|false)',
    addMethod: 'api',
  },
  'PUB;8a91e8e55f4a434f9a60b56f5660c244': {
    title: '[Mad] Triple Bollinger Bands MTF',
    author: 'djmad',
    studyName: 'Script@tv-scripting-101!',
    signature: 'ssv1=PUB;8a91e8e55f4a434f9a60b56f5660c244(|20|1|2|3|false|4|false|5|true|true|true|true|false|90|false|500|true|0|true|35|close|-1|-1|-1|-1|-1|-1|false|false)',
    addMethod: 'indicators-dialog',
  },
  'Script$STD;MACD@tv-scripting-101': {
    title: 'Moving Average Convergence Divergence',
    studyName: 'Script@tv-scripting-101!',
    signature: 'ssv1=STD;MACD(close|12|26|9||true|false|false)',
    section: 'TECHNICALS',
    addMethod: 'indicators-dialog',
  },
  'Script$STD;RSI@tv-scripting-101': {
    title: 'Relative Strength Index',
    studyName: 'Script@tv-scripting-101!',
    signature: 'ssv1=STD;RSI(14|close|false|14|2||true|false|false)',
    section: 'TECHNICALS',
    addMethod: 'indicators-dialog',
  },
});

function _resolve(deps) {
  return {
    evaluate: deps?.evaluate || _evaluate,
    evaluateAsync: deps?.evaluateAsync || _evaluateAsync,
    waitForChartReady: deps?.waitForChartReady || _waitForChartReady,
  };
}

export async function getState({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const state = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = [];
      try {
        var allStudies = chart.getAllStudies();
        studies = allStudies.map(function(s) {
          return { id: s.id, name: s.name || s.title || 'unknown' };
        });
      } catch(e) {}
      var sym = '';
      try {
        var ext = chart.symbolExt();
        if (ext) sym = ext.full_name || ext.pro_name || ext.symbol || '';
      } catch(e) {}
      if (!sym) { try { sym = chart.symbol(); } catch(e) {} } // deprecated fallback
      return {
        symbol: sym,
        resolution: chart.resolution(),
        chartType: chart.chartType(),
        studies: studies,
      };
    })()
  `);
  return { success: true, ...state };
}

export async function setSymbol({ symbol, _deps }) {
  const { evaluateAsync, waitForChartReady } = _resolve(_deps);
  await evaluateAsync(`
    (function() {
      var chart = ${CHART_API};
      return new Promise(function(resolve) {
        chart.setSymbol(${safeString(symbol)}, {});
        setTimeout(resolve, 500);
      });
    })()
  `);
  const ready = await waitForChartReady(symbol);
  return { success: true, symbol, chart_ready: ready };
}

export async function setTimeframe({ timeframe, _deps }) {
  const { evaluate, waitForChartReady } = _resolve(_deps);
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setResolution(${safeString(timeframe)}, {});
    })()
  `);
  const ready = await waitForChartReady(null, timeframe);
  return { success: true, timeframe, chart_ready: ready };
}

export async function setType({ chart_type, _deps }) {
  const { evaluate } = _resolve(_deps);
  const typeMap = {
    'Bars': 0, 'Candles': 1, 'Line': 2, 'Area': 3,
    'Renko': 4, 'Kagi': 5, 'PointAndFigure': 6, 'LineBreak': 7,
    'HeikinAshi': 8, 'HollowCandles': 9,
  };
  const typeNum = typeMap[chart_type] ?? Number(chart_type);
  if (isNaN(typeNum) || typeNum < 0 || typeNum > 9 || !Number.isInteger(typeNum)) {
    throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
  }
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setChartType(${typeNum});
    })()
  `);
  return { success: true, chart_type, type_num: typeNum };
}

export async function manageIndicator({ action, indicator, entity_id, inputs: inputsRaw, _deps }) {
  const { evaluate } = _resolve(_deps);
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;

  if (action === 'add') {
    const inputArr = inputs ? Object.entries(inputs).map(([k, v]) => ({ id: k, value: v })) : [];
    const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.createStudy(${safeString(indicator)}, false, false, ${JSON.stringify(inputArr)});
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));
    const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    const newIds = (after || []).filter(id => !(before || []).includes(id));
    return { success: newIds.length > 0, action: 'add', indicator, entity_id: newIds[0] || null, new_study_count: newIds.length };
  } else if (action === 'remove') {
    if (!entity_id) throw new Error('entity_id required for remove action. Use chart_get_state to find study IDs.');
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.removeEntity(${safeString(entity_id)});
      })()
    `);
    return { success: true, action: 'remove', entity_id };
  } else {
    throw new Error('action must be "add" or "remove"');
  }
}

function knownStudySnapshotExpression() {
  return `
    (function() {
      var chart = ${CHART_API};
      var model = chart._chartWidget.model();
      return chart.getAllStudies().map(function(item) {
        var source = null;
        try { source = model.dataSourceForId(item.id); } catch (e) {}
        var studyName = null, signature = null;
        try { studyName = source && source._studyName && source._studyName.value(); } catch (e) {}
        try { signature = source && source._signature && source._signature.value(); } catch (e) {}
        return { entity_id: item.id, title: item.name || item.title || 'unknown', study_name: studyName, signature: signature };
      });
    })()
  `;
}

function matchingKnownStudy(studies, definition) {
  return (studies || []).find(study =>
    study.study_name === definition.studyName && study.signature === definition.signature
  );
}

async function addFromIndicatorsDialog(evaluateAsync, definition) {
  return evaluateAsync(`
    (async function() {
      var wanted = ${safeString(definition.title)};
      var wantedSection = ${safeString(definition.section || '')};
      var wantedAuthor = ${safeString(definition.author || '')}.toLowerCase();
      var delay = function(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); };
      var visible = function(el) {
        if (!el) return false;
        var r = el.getBoundingClientRect();
        var s = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      };
      var text = function(el) { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); };
      var closeDialog = function() {
        var close = Array.from(document.querySelectorAll('button[aria-label="Close"]')).find(visible);
        if (close) close.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      };

      var search = Array.from(document.querySelectorAll('input[placeholder="Search"]')).find(visible) || null;
      if (!search) {
        var open = Array.from(document.querySelectorAll('button[data-name="open-indicators-dialog"]')).find(visible);
        if (!open) throw new Error('TradingView Indicators button is not visible');
        open.click();
      }
      for (var i = 0; i < 30 && !search; i++) {
        search = Array.from(document.querySelectorAll('input[placeholder="Search"]')).find(visible);
        if (!search) await delay(100);
      }
      if (!search) {
        closeDialog();
        throw new Error('TradingView Indicators search field did not open');
      }

      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(search, wanted);
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(700);

      var candidate = null;
      for (var attempt = 0; attempt < 30 && !candidate; attempt++) {
        var all = Array.from(document.querySelectorAll('div,span,h1,h2,h3,h4,h5,h6,p,[role="heading"]')).filter(visible);
        var headings = wantedSection ? all.filter(function(el) { return text(el).toUpperCase() === wantedSection.toUpperCase(); }) : [];
        var heading = headings.sort(function(a, b) {
          return a.getBoundingClientRect().width - b.getBoundingClientRect().width;
        })[0];
        var matches = all.filter(function(el) {
          return text(el) === wanted && !Array.from(el.children).some(function(child) { return text(child) === wanted; });
        });
        if (wantedSection && !heading) {
          matches = [];
        } else if (heading) {
          var headingTop = heading.getBoundingClientRect().top;
          matches = matches.filter(function(el) { return el.getBoundingClientRect().top > headingTop; });
          matches.sort(function(a, b) {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
          });
        }
        if (wantedAuthor) {
          matches = matches.filter(function(el) {
            var node = el;
            for (var depth = 0; node && depth < 7; depth++, node = node.parentElement) {
              if (text(node).toLowerCase().includes(wantedAuthor)) return true;
            }
            return false;
          });
        }
        candidate = matches[0] || null;
        if (!candidate) await delay(100);
      }
      if (!candidate) {
        closeDialog();
        throw new Error('Exact Indicators result not found: ' + wanted + (wantedAuthor ? ' by ' + wantedAuthor : ''));
      }

      var row = candidate.closest('[role="row"], [data-role="list-item"], li') || candidate.parentElement;
      (row || candidate).click();
      await delay(500);

      closeDialog();
      return { clicked: true, title: wanted };
    })()
  `);
}

/**
 * Idempotently add one exact, versioned TradingView built-in indicator.
 * The stable full study ID is the input; the session-scoped entity ID is output only.
 */
export async function addKnownIndicator({ indicator_id, length, _deps }) {
  const { evaluate, evaluateAsync } = _resolve(_deps);
  const baseDefinition = KNOWN_INDICATORS[indicator_id];
  if (!baseDefinition) {
    throw new Error(`Unknown indicator_id: ${indicator_id}. Use one of: ${Object.keys(KNOWN_INDICATORS).join(', ')}`);
  }

  const isExponentialMovingAverage = indicator_id === 'MAExp@tv-basicstudies-274';
  if (length !== undefined && !isExponentialMovingAverage) {
    throw new Error('length is supported only for MAExp@tv-basicstudies-274');
  }
  const exponentialMovingAverageLength = isExponentialMovingAverage ? Number(length ?? 9) : null;
  if (isExponentialMovingAverage && ![9, 21, 50, 200].includes(exponentialMovingAverageLength)) {
    throw new Error('MAExp@tv-basicstudies-274 length must be one of: 9, 21, 50, 200');
  }
  const definition = isExponentialMovingAverage
    ? {
        ...baseDefinition,
        signature: `ssv1=undefined(${exponentialMovingAverageLength}|close)`,
        inputs: { length: exponentialMovingAverageLength, source: 'close' },
      }
    : baseDefinition;

  const before = await evaluate(knownStudySnapshotExpression());
  const existing = matchingKnownStudy(before, definition);
  if (existing) {
    return {
      success: true,
      action: 'reused',
      indicator_id,
      ...(isExponentialMovingAverage ? { length: exponentialMovingAverageLength, source: 'close' } : {}),
      ...existing,
      verified: true,
    };
  }

  if (definition.addMethod === 'api') {
    await evaluate(`
      (function() {
        ${CHART_API}.createStudy(${safeString(definition.title)}, false, false, ${JSON.stringify(definition.inputs || {})});
      })()
    `);
  } else {
    await addFromIndicatorsDialog(evaluateAsync, definition);
  }

  const timeoutAt = Date.now() + 10000;
  while (Date.now() < timeoutAt) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const after = await evaluate(knownStudySnapshotExpression());
    const added = matchingKnownStudy(after, definition);
    if (added) {
      return {
        success: true,
        action: 'added',
        indicator_id,
        ...(isExponentialMovingAverage ? { length: exponentialMovingAverageLength, source: 'close' } : {}),
        ...added,
        verified: true,
      };
    }
  }

  throw new Error(`TradingView did not create the exact requested study within 10 seconds: ${indicator_id}`);
}

export async function getVisibleRange({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
    })()
  `);
  return { success: true, visible_range: result.visible_range, bars_range: result.bars_range };
}

export async function setVisibleRange({ from, to, _deps }) {
  const { evaluate } = _resolve(_deps);
  const f = requireFinite(from, 'from');
  const t = requireFinite(to, 'to');
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${f} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${t}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await new Promise(r => setTimeout(r, 500));
  const actual = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      try { var r = chart.getVisibleRange(); return { from: r.from || 0, to: r.to || 0 }; }
      catch(e) { return { from: 0, to: 0, error: e.message }; }
    })()
  `);
  return { success: true, requested: { from, to }, actual: actual || { from: 0, to: 0 } };
}

export async function scrollToDate({ date, _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  let timestamp;
  if (/^\d+$/.test(date)) timestamp = Number(date);
  else timestamp = Math.floor(new Date(date).getTime() / 1000);
  if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

  const resolution = await evaluate(`${CHART_API}.resolution()`);
  let secsPerBar = 60;
  const res = String(resolution);
  if (res === 'D' || res === '1D') secsPerBar = 86400;
  else if (res === 'W' || res === '1W') secsPerBar = 604800;
  else if (res === 'M' || res === '1M') secsPerBar = 2592000;
  else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

  const halfWindow = 25 * secsPerBar;
  const from = timestamp - halfWindow;
  const to = timestamp + halfWindow;

  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${from} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${to}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await new Promise(r => setTimeout(r, 500));
  return { success: true, date, centered_on: timestamp, resolution, window: { from, to } };
}

export async function symbolInfo({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var info = chart.symbolExt();
      return {
        symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
        description: info.description, type: info.type, pro_name: info.pro_name,
        typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType()
      };
    })()
  `);
  return { success: true, ...result };
}

export async function symbolSearch({ query, type }) {
  // Use TradingView's public symbol search REST API (works without auth)
  const params = new URLSearchParams({
    text: query,
    hl: '1',
    exchange: '',
    lang: 'en',
    search_type: type || '',
    domain: 'production',
  });

  const resp = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
    headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' },
  });
  if (!resp.ok) throw new Error(`Symbol search API returned ${resp.status}`);
  const data = await resp.json();

  const strip = s => (s || '').replace(/<\/?em>/g, '');
  const results = (data.symbols || data || []).slice(0, 15).map(r => ({
    symbol: strip(r.symbol),
    description: strip(r.description),
    exchange: r.exchange || r.prefix || '',
    type: r.type || '',
    full_name: r.exchange ? `${r.exchange}:${strip(r.symbol)}` : strip(r.symbol),
  }));

  return { success: true, query, source: 'rest_api', results, count: results.length };
}
