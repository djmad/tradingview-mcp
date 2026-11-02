# TradingView MCP — djmad fork

TradingView Desktop automation with a permission administration TUI, live activity dashboard, stdio, Streamable HTTP and legacy SSE. Version 2.1.0 combines this fork's local enhancements and news/financial tools with upstream main through `c05b8f5755ed8e64ea242de88ddbf46aa24d56a4`.

Unofficial project, unaffiliated with TradingView Inc. or Anthropic. Uses undocumented Desktop APIs; a TradingView update can change their behavior. Use your own account and comply with the applicable platform and market-data terms. See [LICENSE](LICENSE), [SECURITY.md](SECURITY.md), and [RESEARCH.md](RESEARCH.md).

## Setup

Requires Node.js >=20.19 and TradingView Desktop with CDP enabled (default `127.0.0.1:9222`).

```powershell
npm ci --ignore-scripts
npm run admin
```

The permission administrator saves settings to the `.env` in the current directory. Run commands from the project root. Start TradingView with CDP using the platform scripts in [scripts](scripts); `tv_launch` can also launch it, but defaults to closing existing instances. Do not use launch merely to check an already running session.

## Choose what the MCP may do

```powershell
npm run admin
```

- **R**: Read preset. **W**: Read/write preset. **C**: Custom selection.
- **Up/Down**, **PageUp/PageDown**, **Home/End**: select a tool.
- **Space**: toggle the selected tool. Write tools stay disabled in Read mode.
- **Enter**: view its current description and all parameter descriptions; scroll with Up/Down or PageUp/PageDown. Enter/Escape returns to the list.
- **S**: save. **Q**: quit; unsaved changes require confirmation.

All 75 registered tools have an explicit read/write classification. News, financials, technicals, ETF profiles, seasonals and asset-data discovery appear in the administrator. Upstream additions include indicator search/add, watchlist bulk add/remove, new layouts, and self-update. Indicator search is classified as write because it opens and operates the Indicators dialog.

Entering Custom preserves the current effective selection; it does not grant extra write tools. Existing individual denials remain in place when switching presets. Both MCP and CLI operations honor the same settings. Changes that disable a tool take effect before its next MCP call; reconnect the client to expose newly enabled tools. An operation already running is not interrupted. Process environment values override `.env`.

Without saved settings the compatibility default is Read/write. Select Read and save if that is your preferred default. Configuration uses `MCP_PERM_MODE=read|rw|custom`, `MCP_PERM_ENABLED` and `MCP_PERM_DISABLED` (comma-separated names). Unknown tools are denied, and server startup rejects a mismatch between registered tools and the permission catalog.

Permissions restrict calls made through this package's MCP and CLI interfaces. The package does not sandbox arbitrary code with filesystem/CDP access. Enabling general JavaScript/UI automation also enables broad actions within TradingView; narrower disabled tools do not constrain equivalent operations performed through those general controls. Screenshot reads create local PNG files.

## Start the server

```powershell
npm start                  # Streamable HTTP plus activity dashboard
npm run stdio              # stdio for clients that spawn their MCP process
npm run sse                # legacy HTTP+SSE plus activity dashboard
```

Streamable HTTP endpoint: `http://127.0.0.1:3333/mcp`. Legacy endpoint: `http://127.0.0.1:3333/sse`. The activity dashboard reports sessions, requests, running tools, errors and CDP connectivity. It is separate from the permission administrator.

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["C:/path/to/tradingview-mcp/src/server.js", "--stdio"],
      "cwd": "C:/path/to/tradingview-mcp"
    }
  }
}
```

`TV_CDP_HOST`/`TV_CDP_PORT` override the CDP endpoint; `CDP_HOST`/`CDP_PORT` remain supported aliases. Keep both MCP and CDP bound to trusted local interfaces.

## Tool workflows

Start with `tv_health_check`. Use exact `SOURCE:TICKER` instrument identifiers; resolve unclear symbols with `symbol_search`.

| Task | Tools |
|---|---|
| Read chart | `chart_get_state`, `quote_get`, `data_get_ohlcv`, `data_get_study_values` |
| Change chart | `chart_set` with `symbol`, `timeframe`, `chart_type`, `visible_range`, or `scroll_to` |
| Indicators | `chart_manage_indicator`, `add_known_indicator`, `indicator_search`, `indicator_add`, `indicator_set_inputs` |
| Pine drawings | `data_get_pine_graphics` with requested `kinds` |
| Pine editor | `pine_edit` with an explicit `action`; separate `pine_new`, `pine_open`, `pine_list_scripts` |
| Replay | `replay` with an explicit `action` |
| News | `news_get`, `news_get_content` |
| Fundamentals | `symbol_data_available`, `data_get_technicals`, `data_get_financials`, `data_get_etf_profile`, `data_get_seasonals` |
| Strategy reports | `data_get_strategy_results`, `data_get_trades`, `data_get_equity`; write tool `strategy_prepare` opens the panel and unhides strategies when explicitly requested |
| Export | `data_save_ohlcv` writes CSV in `OHLCV/` |

`quote_get` never switches charts. Strategy reads do not open panels or change study visibility. Upstream's report preparation remains available through the separately permissioned `strategy_prepare` tool. `capture_screenshot` accepts upstream's `wait_for_render` parameter.

The chart, Pine, graphics and replay dispatcher names above replace the base repository's separate action tools. Clients using old names must update their calls. The administrator's parameter view and MCP `tools/list` are authoritative for the current schemas. [skills/overview.md](skills/overview.md) provides workflow context.

News and fundamental tools contact TradingView-owned endpoints. Public scanner requests fall back to a bounded server-side fetch without cookies when Desktop CORS blocks the page request. Canonical listing symbols are used for financial queries (for example, a BATS feed for AAPL maps to its NASDAQ listing). Missing data and API errors remain visible in results. Screenshots, exported data, private scripts and permission settings are excluded from Git.

## Verification and maintenance

```powershell
npm test                   # automatically includes all *.test.js except e2e.test.js
npm run lint
npm audit
npm run test:e2e            # explicit live suite; can mutate chart/account state
node scripts/live-smoke.js  # opt-in, only accepts a layout named temp
```

The normal suite includes unit and local transport tests plus existing TradingView compile-API checks. The live smoke test reads health/quotes/data/news/financials, draws and removes one line, changes and restores timeframe, and checks permission enforcement and restoration. It does not run alerts, trades, or Pine editor saves.

See [integration notes](docs/INTEGRATION.md) and [the PR review ledger](docs/upstream-pr-triage.md) for provenance, checks and feature candidates awaiting a later decision. The full upstream history and original MIT license text are retained. Self-update follows this fork's `origin/main`, using a clean fast-forward only.
