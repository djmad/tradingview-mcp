---
name: multi-symbol-scan
description: Scan, compare, and organize multiple TradingView symbols or timeframes using watchlists, batch actions, OHLCV data, saved CSV exports, layouts, panes, and tabs. Use for screeners, cross-asset comparisons, multi-timeframe reviews, watchlist analysis, or bulk chart evidence collection.
---

# Multi-Symbol Scan

## Define the scan

1. Call `tv_health_check` and `chart_get_state`.
2. Get candidates from the user, `watchlist_get`, or `symbol_search`.
3. Represent every candidate as `SOURCE:TICKER`. When the source/exchange is unclear, use `symbol_search` and select `results[].full_name` by exchange, type, and description; never guess the source.
4. Define symbols, timeframes, ranking criteria, maximum bar count, and whether the scan may change the active chart.
5. Preserve the starting symbol and timeframe so they can be restored with `chart_set`.

## Choose the execution path

Use `batch_run` for supported repeated actions:

- `action=screenshot` for visual evidence.
- `action=get_ohlcv` with `ohlcv_count` for bar-based screening.
- `action=get_strategy_results` for strategy comparisons.

Set a realistic `delay_ms` so TradingView can load each symbol and timeframe. Treat partial failures as per-item results, not as evidence that the entire scan succeeded.

Use a manual loop when criteria need tools outside `batch_run`:

1. Set symbol and timeframe together with `chart_set`.
2. Read `quote_get`, `data_get_ohlcv`, `data_get_study_values`, or `data_get_strategy_results` as required.
3. Capture only shortlisted charts with `capture_screenshot`.
4. Restore the original chart state.

## OHLCV workflows

- Use `data_get_ohlcv` for in-context analysis. Start with `summary=true`, then fetch raw bars only for candidates requiring calculations.
- Use `data_save_ohlcv` when the user wants durable CSV history. Specify `symbol`, `timeframe`, and bounded `max_history`; increase `settle_ms` on slow charts.
- Record the returned path, actual bar count, symbol, timeframe, and date coverage. Never imply that TradingView loaded more history than the returned result confirms.

## Organize TradingView views

- Use `layout_list` before `layout_switch`; switch only to a user-approved saved layout.
- Use `pane_list` before changing a multi-chart grid.
- Use `pane_set_layout`, then `pane_set_symbol`, and use `pane_focus` before operations that apply to the active pane.
- Use `tab_list` before tab operations. Use `tab_new` and `tab_switch` for parallel views; use `tab_close` only after confirming the target tab.

## Watchlist actions

- Use `watchlist_get` to source or verify the scan universe.
- Use `watchlist_add` only when the user asks to persist a symbol; avoid duplicates when the symbol is already present.

## Report

Return a ranked table containing symbol, exchange-qualified identifier, timeframe, price or OHLCV window, relevant metrics, signal, and caveats. Separate missing data from negative signals and identify the exact scan time.
