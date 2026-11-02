/**
 * Core indicator settings logic.
 */
import { evaluate, safeString } from '../connection.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

export async function setInputs({ entity_id, inputs: inputsRaw }) {
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (!inputs || typeof inputs !== 'object' || Object.keys(inputs).length === 0) {
    throw new Error('inputs must be a non-empty object, e.g. { length: 50 }');
  }

  const inputsJson = JSON.stringify(inputs);

  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var study = chart.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      var overrides = ${inputsJson};
      // Resolve override keys to input ids via metadata: accepts raw ids (in_0) and display names.
      var info = [];
      try { info = study.getInputsInfo() || []; } catch (e) {}
      var validIds = {};
      var nameToId = {};
      for (var j = 0; j < info.length; j++) {
        validIds[info[j].id] = true;
        var nm = info[j].name || info[j].title;
        if (nm && !(nm in nameToId)) nameToId[nm] = info[j].id;
      }
      var resolved = {};
      for (var key in overrides) {
        var id = validIds[key] ? key : nameToId[key];
        if (id) resolved[id] = overrides[key];
        else if (info.length === 0) resolved[key] = overrides[key];
      }
      // applyOverrides is the only path that reliably reaches the study engine and
      // triggers a recalculation (setInputValues is a no-op for Pine studies whose
      // getInputValues() comes back empty).
      var updatedKeys = {};
      var prefixed = {};
      for (var id2 in resolved) {
        prefixed['inputs.' + id2] = resolved[id2];
        updatedKeys[id2] = resolved[id2];
      }
      if (Object.keys(prefixed).length > 0) study.applyOverrides(prefixed);
      return { updated_inputs: updatedKeys };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, updated_inputs: result.updated_inputs };
}

export async function toggleVisibility({ entity_id, visible }) {
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (typeof visible !== 'boolean') throw new Error('visible must be a boolean (true or false)');

  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var study = chart.getStudyById(${safeString(entity_id)});
      if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
      study.setVisible(${visible});
      var actualVisible = study.isVisible();
      return { visible: actualVisible };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, visible: result.visible };
}
