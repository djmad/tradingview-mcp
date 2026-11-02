---
name: strategy-report
description: Produce a structured TradingView strategy report with tester metrics, trades, equity, OHLCV regime context, screenshots, findings, and recommendations. Use after a Pine strategy backtest when the user wants a reusable written assessment or comparison-ready report.
---

# TradingView Strategy Report

## Collect the report package

1. Call `tv_health_check`, `chart_get_state`, and `symbol_info`.
2. Collect `data_get_strategy_results`, `data_get_trades`, and `data_get_equity`.
3. Add `data_get_ohlcv` context for the tested market window. Use raw bars only when calculating statistics; otherwise use `summary=true`.
4. Read `data_get_study_values` or `data_get_pine_graphics` when the strategy's visible filters or annotations are material.
5. Capture `region=chart` and `region=strategy_tester` with `capture_screenshot`.
6. Use `data_save_ohlcv` only when the user requests a CSV appendix or reproducible dataset; record the returned coverage and bar count.

## Analyze without inventing data

- Use TradingView-reported values for net profit, return, total trades, win rate, profit factor, drawdown, average trade, and other tester fields.
- Derive winner/loser statistics only from the returned trade sample and label sample-limited calculations.
- Assess equity shape from returned points; identify prolonged drawdowns and profit concentration.
- Relate results to OHLCV regime, volatility, trend, and timeframe without claiming causality unsupported by the data.
- Flag small samples, missing metrics, possible overfitting, and strategy settings that were not captured.

## Write the report

Use this structure:

1. Strategy, symbol, timeframe, and tested period.
2. Executive summary and confidence level.
3. Key metrics table with data source.
4. Trade-distribution findings.
5. Equity and drawdown assessment.
6. OHLCV market-regime context.
7. Strengths, weaknesses, and failure modes.
8. Prioritized recommendations and concrete validation steps.
9. Evidence paths and limitations.

Keep performance analysis separate from financial advice. Never extrapolate a backtest into guaranteed live returns.
