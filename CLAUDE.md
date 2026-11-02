# Working with the djmad TradingView MCP fork

Read [README.md](README.md) for setup, permissions, networking and test limits. The current MCP schema and permission administrator (Enter for parameter details) are authoritative.

- Start with `tv_health_check`. Do not launch or close TradingView merely to check the connection.
- Every instrument must use SOURCE:TICKER. Resolve ambiguity with `symbol_search`.
- Read current state before mutations. Work only on the layout/tab authorized by the user.
- `chart_set` groups symbol/timeframe/type/range/scroll actions.
- `pine_edit` groups source, compile, errors, console, check, analyze and save actions. `pine_new`, `pine_open` and `pine_list_scripts` remain separate tools.
- `data_get_pine_graphics` groups line/label/table/box reads with `kinds`.
- `replay` groups replay actions. Replay trade is paper practice; do not perform account trades.
- `quote_get` reads only the current instrument and never switches charts.
- Strategy read tools never prepare or unhide studies. `strategy_prepare` is a separate write permission.
- The permission catalog covers every registered tool. Classify new tools and update CLI mappings before exposing them; tests and server startup reject missing catalog entries.
- Run `npm test` and `npm run lint` for changes. `npm run test:e2e` requires explicit live test scope and can mutate state.
- Live smoke checks require the disposable layout named temp and must restore the initial chart state.
- Keep `.env`, tokens, private Pine scripts, exports, screenshots, training results and local audit artifacts out of Git.

For workflow guidance use the [skills index](skills/overview.md). See [integration notes](docs/INTEGRATION.md) for upstream revision, selected fixes, deferred work and verification limits.
