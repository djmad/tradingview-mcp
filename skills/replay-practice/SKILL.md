---
name: replay-practice
description: Run guided manual trading practice in TradingView Bar Replay using historical OHLCV context, indicators, drawings, screenshots, simulated trades, and P&L review. Use for replay sessions, discretionary backtesting, trade-entry practice, or bar-by-bar strategy rehearsal.
---

# TradingView Replay Practice

## Set up

1. Call `tv_health_check` and save the initial state with `chart_get_state`.
2. Configure symbol and timeframe in one `chart_set` call.
3. Load pre-session context with `data_get_ohlcv`; request enough bars to avoid look-ahead beyond the chosen replay date.
4. Add approved studies with `chart_manage_indicator` and mark planned levels with `draw_shape`.
5. Capture the starting state with `capture_screenshot`.

## Control replay

Use the single `replay` dispatcher:

- `{action: "start", date: "YYYY-MM-DD"}` to enter replay.
- `{action: "step"}` to advance one bar.
- `{action: "autoplay", speed: 100|143|200|300|1000|2000|3000|5000|10000}` to toggle autoplay and optionally set delay.
- `{action: "status"}` to read date, position, and P&L.
- `{action: "trade", trade_action: "buy"|"sell"|"close"}` to operate the simulated replay position.
- `{action: "stop"}` to return to realtime.

Use only the `replay` dispatcher for every replay operation.

## Practice loop

1. Read `replay` status before making a decision.
2. Advance one bar or use controlled autoplay.
3. Re-read chart evidence with `data_get_ohlcv`, `quote_get`, or `capture_screenshot` when needed.
4. Record the setup, decision, entry, exit, and invalidation without using future bars.
5. Confirm every simulated trade from the returned replay status.

Use `draw_list` and `draw_get_properties` to review annotations. Use `draw_remove_one` for temporary marks; use `draw_clear` only with explicit confirmation.

## Finish

1. Close any open replay position when requested.
2. Capture the final chart.
3. Call `replay` with `action=stop`, including after errors whenever possible.
4. Restore the initial symbol and timeframe with `chart_set` if the session changed them.
5. Report trades, P&L, process mistakes, rule adherence, and lessons. Treat replay results as practice evidence, not live-performance guarantees.
