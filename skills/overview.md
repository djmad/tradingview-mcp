# TradingView MCP Skills and Tool Coverage

This index covers the complete TradingView MCP catalog: all 60 registered tools, including tools hidden by the current permission mode. Runtime availability is controlled by `.env` or the permission TUI; absence from the active MCP tool list does not remove a tool from this catalog.

## Skill routing

| Skill | Use for |
|---|---|
| `chart-analysis` | Chart setup, live price, technical analysis, indicators, drawings, alerts, screenshots, DOM, and UI fallback |
| `multi-symbol-scan` | Watchlists, batch scans, multi-timeframe comparison, OHLCV collection/export, layouts, panes, and tabs |
| `performance-analyst` | Backtest diagnosis, trade/equity analysis, robustness, drawdowns, and cross-market comparisons |
| `pine-develop` | Pine creation, editing, checking, compiling, saving, runtime diagnostics, and chart verification |
| `replay-practice` | Bar Replay setup, stepping, autoplay, simulated trades, annotations, and session review |
| `strategy-report` | Evidence-backed written strategy reports with metrics, trades, equity, OHLCV context, and captures |

## Permission model

- `read`: expose only catalog entries marked Read, except explicitly disabled tools.
- `rw`: expose Read and Write tools, except explicitly disabled tools.
- `custom`: expose only explicitly enabled tools, minus explicitly disabled tools.
- Run `npm run admin` to manage permissions. Write classification includes chart mutations, file exports, launches, replay actions, alerts, UI automation, layout changes, and other persistent or stateful operations.

Always call `tv_health_check` first. Read current state before mutation, confirm destructive or externally visible actions, and verify returned state afterward.

## Symbol identity rule

- Every TradingView instrument is identified as `SOURCE:TICKER` (exchange/data source plus ticker). Never send an unqualified ticker to a symbol parameter.
- Examples: `TVC:GOLD`, `TVC:VIX`, `INDEX:BTCUSD`, `NYSE:AI`, `XETR:SIE`, `XETR:OMV`, `XETR:VAS`, `NASDAQ:AAPL`, `CME_MINI:ES1!`.
- TradingView URLs may encode the same identity as `/symbols/TVC-GOLD/` or `/symbols/BTCUSD/?exchange=INDEX`; MCP tools use `TVC:GOLD` and `INDEX:BTCUSD` respectively.
- If the source/exchange is unknown or ambiguous, call `symbol_search`, compare `exchange`, `type`, and `description`, then pass the chosen `results[].full_name` exactly. Never guess the source.
- Read-only tools operate on the active chart unless their description says otherwise. In particular, `quote_get` validates an optional symbol but never switches the chart.

## Complete 60-tool catalog

| Group | Read tools | Write tools | Primary skill |
|---|---|---|---|
| Health | `tv_health_check`, `tv_discover`, `tv_ui_state` | `tv_launch` | `chart-analysis` |
| Chart | `chart_get_state`, `chart_get_visible_range` | `chart_set`, `chart_manage_indicator`, `add_known_indicator` | `chart-analysis` |
| Data | `data_get_equity`, `data_get_indicator`, `data_get_ohlcv`, `data_get_pine_graphics`, `data_get_strategy_results`, `data_get_study_values`, `data_get_trades`, `quote_get`, `depth_get`, `symbol_info`, `symbol_search` | `data_save_ohlcv` | `chart-analysis`, `performance-analyst`, `strategy-report` |
| Pine | `pine_list_scripts` | `pine_edit`, `pine_new`, `pine_open` | `pine-develop` |
| Drawing | `draw_get_properties`, `draw_list` | `draw_shape`, `draw_clear`, `draw_remove_one` | `chart-analysis`, `replay-practice` |
| Alerts | `alert_list` | `alert_create`, `alert_modify`, `alert_delete` | `chart-analysis` |
| Capture | `capture_screenshot` | None | All evidence-producing skills |
| Indicators | None | `indicator_set_inputs`, `indicator_toggle_visibility` | `chart-analysis`, `pine-develop` |
| Watchlist | `watchlist_get` | `watchlist_add` | `multi-symbol-scan` |
| Layout | `layout_list` | `layout_switch` | `multi-symbol-scan` |
| Pane | `pane_list` | `pane_focus`, `pane_set_layout`, `pane_set_symbol` | `multi-symbol-scan` |
| Tab | `tab_list` | `tab_close`, `tab_new`, `tab_switch` | `multi-symbol-scan` |
| Replay | None | `replay` | `replay-practice` |
| Batch | None | `batch_run` | `multi-symbol-scan`, `performance-analyst` |
| UI | `ui_find_element` | `ui_click`, `ui_evaluate`, `ui_fullscreen`, `ui_hover`, `ui_keyboard`, `ui_mouse_click`, `ui_open_panel`, `ui_scroll`, `ui_type_text` | `chart-analysis`, `pine-develop` |

## Dispatcher quick reference

- `chart_set`: combine `symbol`, `timeframe`, `chart_type`, `visible_range`, and `scroll_to` in one request.
- `pine_edit`: use `get_source`, `set_source`, `compile`, `smart_compile`, `get_errors`, `get_console`, `save`, `check`, or `analyze`.
- `replay`: use `start`, `step`, `autoplay`, `stop`, `trade`, or `status`.
- `batch_run`: use `screenshot`, `get_ohlcv`, or `get_strategy_results`.

## OHLCV rules

- Use `data_get_ohlcv` for data returned directly to the model. Start with `summary=true`; request raw bars only when needed for calculations.
- Use `data_save_ohlcv` for durable CSV export. It can switch symbol/timeframe, paginate older history, and stop at `max_history` or `max_iterations`.
- Use `batch_run` with `action=get_ohlcv` for repeated bounded scans; set `ohlcv_count` explicitly.
- Always report symbol, timeframe, requested versus returned bar count, and actual date coverage.

## High-impact safeguards

- Confirm `tv_launch` when it may terminate an existing TradingView process.
- Confirm `draw_clear`, `alert_delete`, `tab_close`, saved-layout changes, and persistent watchlist or CSV actions.
- Use `ui_evaluate` only as a last resort and avoid arbitrary mutation without explicit authorization.
- Keep the default bind address local (`127.0.0.1`) and use the Streamable HTTP endpoint `/mcp` for Codex.
