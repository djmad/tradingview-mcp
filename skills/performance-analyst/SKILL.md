---
name: performance-analyst
description: Analyze TradingView strategy performance, trades, equity, market regime, and robustness. Use when reviewing a strategy backtest, diagnosing drawdowns, comparing performance across symbols or timeframes, or proposing evidence-based risk and execution improvements.
---

# Trading Strategy Performance Analysis

## Gather evidence

1. Call `tv_health_check` and `chart_get_state`.
2. Use `symbol_info` and `quote_get` for instrument context.
3. Collect `data_get_strategy_results`, `data_get_trades` with an appropriate `max_trades`, and `data_get_equity`.
4. Use `data_get_ohlcv` to characterize the tested market regime and volatility. Prefer `summary=true` for orientation, then request raw bars when validating regime claims.
5. Use `data_get_study_values` when visible indicators explain entries or filters.
6. Capture the chart and tester with `capture_screenshot` when visual verification matters.

If Strategy Tester is not ready, use `ui_open_panel` with `panel=strategy-tester`, then retry. Do not fabricate unavailable metrics.

## Evaluate

- Profitability: net profit, return, profit factor, average trade, expectancy.
- Consistency: win rate, streaks, equity smoothness, concentration of gains.
- Risk: absolute and percentage drawdown, worst trade, tail losses, recovery time.
- Trade quality: average winner/loss, reward-to-risk, long/short asymmetry, holding time.
- Robustness: sample size, sensitivity to symbol/timeframe, performance across market regimes, and outlier dependence.

State the source field for every numeric conclusion. Distinguish reported TradingView metrics from values calculated from trades or OHLCV.

## Compare variants

Use `batch_run` with `action=get_strategy_results` for supported multi-symbol or multi-timeframe comparisons. Keep strategy settings constant unless the user explicitly requests parameter variants. Report failures and missing tester data separately.

## Deliver

Provide:

1. A short verdict with confidence level.
2. A key-metrics table.
3. Drawdown and equity-curve assessment.
4. Trade-distribution and regime observations.
5. Specific improvements ranked by expected impact and validation cost.
6. Limitations, including sample size and possible overfitting.

Do not infer live profitability from a historical backtest or present recommendations as guaranteed financial outcomes.
