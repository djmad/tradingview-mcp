---
name: chart-analysis
description: Analyze and operate an active TradingView chart using market data, indicators, Pine graphics, drawings, alerts, screenshots, and UI controls. Use for technical analysis, current-price checks, chart setup, support/resistance work, indicator review, alert management, depth inspection, or visual chart automation.
---

# TradingView Chart Analysis

## Prepare

1. Call `tv_health_check` before chart work.
2. If TradingView is unavailable, use `tv_launch` only with the user's approval; never set `kill_existing=true` without explicit confirmation.
3. Use `tv_discover` when an internal TradingView API appears unavailable and `tv_ui_state` when a panel or control cannot be found.
4. Call `chart_get_state` before changing symbol, timeframe, chart type, indicators, or visible range.

## Set up the chart

- Every instrument must use `SOURCE:TICKER`. If the source/exchange is unknown or ambiguous, call `symbol_search`, compare exchange/type/description, and use the selected `results[].full_name` exactly; never guess or pass an unqualified ticker.
- Use one `chart_set` call for any combination of `symbol`, `timeframe`, `chart_type`, `visible_range`, and `scroll_to`.
- Verify the result with `chart_get_state` and `chart_get_visible_range`.
- Use `symbol_info` for exchange, instrument type, description, and session context.

## Read market and study data

- Use `quote_get` for the active chart price. Its optional symbol is validation-only, must be the exact active `SOURCE:TICKER`, and never switches the chart.
- Use `data_get_ohlcv` with `summary=true` for compact range statistics. Request raw bars only when calculations require them; use 100-5000 bars according to the analysis horizon.
- Use `data_get_study_values` for current values from all visible studies.
- Use `data_get_indicator` with an entity ID from `chart_get_state` for one study's inputs and metadata.
- Use `data_get_pine_graphics` for visible Pine lines, labels, tables, or boxes. Pass `study_filter` and the smallest useful `kinds` subset.
- Use `depth_get` only when the DOM panel is open and order-book data is relevant.

## Manage indicators

- For the supported exact indicators, use one `add_known_indicator` call per full stable TradingView study ID: `MAExp@tv-basicstudies-274`, `Volume@tv-basicstudies-274`, `PUB;8a91e8e55f4a434f9a60b56f5660c244` (`[Mad] Triple Bollinger Bands MTF` by djmad), `Script$STD;MACD@tv-scripting-101`, or `Script$STD;RSI@tv-scripting-101`. Never pass an abbreviation or a session-scoped entity ID.
- Use `chart_manage_indicator` only for other studies that are not supported by `add_known_indicator`, and pass their full TradingView display name.
- Read the new entity ID from `chart_get_state`.
- Use `indicator_set_inputs` to change parameters and `indicator_toggle_visibility` to show or hide a study.
- Remove temporary studies with `chart_manage_indicator` and the entity ID.

## Annotate safely

1. Inspect existing drawings with `draw_list`.
2. Use `draw_shape` for `horizontal_line`, `vertical_line`, `trend_line`, `rectangle`, or `text`.
3. Read one drawing with `draw_get_properties` before editing conclusions around its coordinates.
4. Use `draw_remove_one` for a targeted cleanup. Use `draw_clear` only after explicit confirmation because it removes every drawing.

## Manage alerts

- Start with `alert_list`.
- Use `alert_create` only after confirming symbol, condition, price, resolution, notifications, expiration, and webhook behavior.
- Use `alert_modify` with only the fields that should change.
- Use `alert_delete` only after confirming the exact alert ID set. Do not use bulk deletion implicitly.

## Capture and report

- Use `capture_screenshot` with `region=chart` for chart analysis, `region=strategy_tester` for tester evidence, or `region=full` for UI context.
- Report the symbol, timeframe, last price, OHLCV window, indicator evidence, support/resistance, invalidation levels, and a neutral uncertainty note. Do not present analysis as guaranteed financial advice.

## UI fallback

Prefer semantic chart tools. When they cannot perform an operation:

1. Inspect with `tv_ui_state` or `ui_find_element`.
2. Use `ui_open_panel`, `ui_click`, or `ui_hover` for named controls.
3. Use `ui_keyboard`, `ui_type_text`, or `ui_scroll` for focused interactions.
4. Use `ui_mouse_click` only with coordinates returned by inspection.
5. Use `ui_fullscreen` only when requested or needed for capture.
6. Use `ui_evaluate` only as a last resort; keep expressions read-only unless the user authorized the mutation.

Re-read state after every UI fallback action.
