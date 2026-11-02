---
name: pine-develop
description: Create, inspect, edit, validate, compile, save, and verify Pine Script indicators, strategies, or libraries in TradingView. Use for new Pine development, modifications, compiler-error repair, study input changes, runtime debugging, or extracting graphics and values from custom studies.
---

# Pine Script Development

## Prepare

1. Call `tv_health_check` and `chart_get_state`.
2. Use `pine_list_scripts` to discover saved scripts and `pine_open` to open the requested one.
3. Use `pine_new` for a new `indicator`, `strategy`, or `library` only after the type is clear.
4. Open the editor with `ui_open_panel` when required.

## Read and validate

- Use `pine_edit` with `action=get_source` only when the source is needed; large scripts can exceed 200 KB.
- Use `action=analyze` for offline static checks before touching the editor.
- Use `action=check` for server-side compilation validation without changing the editor or chart.
- Preserve the complete source and keep `//@version=6` unless the user explicitly targets another version.

## Edit and compile

1. Call `pine_edit` with `action=set_source` and the complete source.
2. Call `pine_edit` with `action=smart_compile`.
3. Read compiler diagnostics with `action=get_errors` and runtime output with `action=get_console`.
4. Fix the specific diagnostics and repeat until compilation is clean.
5. Call `action=save` only when the user wants the TradingView copy persisted.

Use `action=compile` only when the simpler compile click is specifically needed; prefer `smart_compile` for verification.

## Verify on the chart

- Use `chart_get_state` to identify the created study entity.
- Use `data_get_indicator` for inputs and metadata.
- Use `indicator_set_inputs` to change inputs and `indicator_toggle_visibility` to verify visible/hidden behavior.
- Use `data_get_study_values` for plotted values.
- Use `data_get_pine_graphics` with a narrow `study_filter` to inspect lines, labels, tables, and boxes.
- Use `capture_screenshot` for visual verification.
- For strategies, collect `data_get_strategy_results`, `data_get_trades`, and `data_get_equity`.

## UI fallback

Use `tv_ui_state` and `ui_find_element` before `ui_click`, `ui_keyboard`, or `ui_type_text`. Use `ui_evaluate` only when semantic Pine and UI tools cannot complete the task, and keep it read-only unless mutation is explicitly authorized.

Never claim completion without a clean compile result and chart-level verification appropriate to the script type.
