# TradingView MCP — djmad fork

TradingView Desktop automation with a permission administration TUI, live activity dashboard, stdio, Streamable HTTP and legacy SSE. Version 2.2.1 combines this fork's local enhancements and news/financial tools with upstream main through `c05b8f5755ed8e64ea242de88ddbf46aa24d56a4`.

Unofficial project, unaffiliated with TradingView Inc. or Anthropic. Uses undocumented Desktop APIs; a TradingView update can change their behavior. Use your own account and comply with the applicable platform and market-data terms. See [LICENSE](LICENSE), [SECURITY.md](SECURITY.md), and [RESEARCH.md](RESEARCH.md).

## Setup

Requires Node.js 26.13.0 or a newer Node.js 26 release and TradingView Desktop with CDP enabled (default `127.0.0.1:9222`). The `.nvmrc` file pins 26.13.0 for version managers and GitHub CI; update that pin when adopting a newer Node.js 26 release. Node.js 27 is outside this fork's supported runtime range.

```powershell
npm ci --ignore-scripts
npm run admin
```

The permission administrator saves settings to the `.env` in the current directory. Run commands from the project root. **L** in the administrator opts into a bounded metadata-only activity log; logging is off by default. Start TradingView with CDP using the platform scripts in [scripts](scripts); `tv_launch` can also launch it, but defaults to closing existing instances. Do not use launch merely to check an already running session.

## Choose what the MCP may do

```powershell
npm run admin
```

- **R**: Read preset. **W**: Read/write preset. **C**: Custom selection.
- **Up/Down**, **PageUp/PageDown**, **Home/End**: select a tool.
- **Space**: toggle the selected tool. Write tools stay disabled in Read mode.
- **Enter**: view its current description and all parameter descriptions; scroll with Up/Down or PageUp/PageDown. Enter/Escape returns to the list.
- **L**: toggle the optional persistent metadata audit log.
- **F**: open output folders. Select Screenshots/OHLCV with Up/Down, Enter to edit, Enter to accept, Escape to cancel. Empty input restores the default.
- **S**: save. **Q**: quit; unsaved changes require confirmation.

All 84 registered tools have an explicit read/write classification. News, financials, technicals, ETF profiles, seasonals and asset-data discovery appear in the administrator. Upstream additions include indicator search/add, watchlist bulk add/remove, new layouts, and self-update. Indicator search is classified as write because it opens and operates the Indicators dialog.

Entering Custom preserves the current effective selection; it does not grant extra write tools. Existing individual denials remain in place when switching presets. Both MCP and CLI operations honor the same settings. Changes that disable a tool take effect before its next MCP call; reconnect the client to expose newly enabled tools. An operation already running is not interrupted. Process environment values override `.env`.

Without saved settings the compatibility default is Read/write. Select Read and save if that is your preferred default. Configuration uses `MCP_PERM_MODE=read|rw|custom`, `MCP_PERM_ENABLED` and `MCP_PERM_DISABLED` (comma-separated names). Unknown tools are denied, and server startup rejects a mismatch between registered tools and the permission catalog.

Permissions restrict calls made through this package's MCP and CLI interfaces. The package does not sandbox arbitrary code with filesystem/CDP access. Enabling general JavaScript/UI automation also enables broad actions within TradingView; narrower disabled tools do not constrain equivalent operations performed through those general controls. Screenshot reads create local PNG files.

## Screenshot and OHLCV output folders

Open `npm run admin`, press **F**, choose a folder field with Up/Down and press Enter. Type or paste the path; Enter accepts the draft, Escape cancels it. Press **S** to save to the existing `.env` alongside permissions and audit settings. An empty field resets its default. Windows drive paths, UNC paths, spaces, `#`, apostrophes and umlauts are supported. The page displays the effective resolved destination and any process-environment override.

```dotenv
MCP_SCREENSHOT_DIR="D:\TradingView exports\Screenshots"
MCP_OHLCV_DIR="D:\TradingView exports\OHLCV"
```

Relative folder settings are resolved against this project directory. The defaults are the project's `screenshots/` and `OHLCV/`. Keep running the administrator/server from the project root so both use the same existing `.env`; process environment settings override that file. Drive-relative forms such as `C:Exports` are rejected; use a fully qualified drive path. Saved changes apply to the next server/CLI export without a restart. Folder creation occurs during an actual export, and existing exports remain in their previous locations.

CDP screenshots, batch screenshots, CSV exports and bulk OHLCV logs/failure reports use these settings. TradingView's native `method=api` screenshot UI controls its own save destination; if it falls back to CDP, the configured screenshot folder applies. Output filenames are sanitized for traversal and Windows reserved characters/device names. Invalid paths or save failures are displayed in the administrator. The configuration writer replaces only explicitly updated keys and preserves unrelated lines/comments/quoting; failed atomic replacement retains the previous file.

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

Start with `target_list` when more than one chart is open, bind this MCP session using `target_select` with an exact `target_id`, then call `tv_health_check`. A single available chart is pinned automatically; disappearing targets never fall back to a different chart. Use exact `SOURCE:TICKER` instrument identifiers; resolve unclear symbols with `symbol_search`.

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

## Approved extensions in v2.2.0

All six previously proposed extensions are implemented. New tools and parameters appear in the same permission TUI; Read mode continues to hide every new write operation.

| Feature | Interface | Access / result |
|---|---|---|
| History without zoom or scrolling | `data_load_history` with count/before, page/iteration/time bounds | Write permission; requested count means total loaded bars. Inspect reached/exhausted/bounded and verification_complete. A pending request is reported as unknown, never as final viewport proof. |
| Explicit chart/window ownership | `target_list`, `target_select` | List reads; selection is a control/write permission. Each MCP session has its own pinned target and serialized calls. Selecting does not activate a window. |
| Verified indicator styles | `indicator_get_style`, `indicator_set_style` | Read and write separately; exact entity ID and existing allowlisted dotted properties, readback, explicit rollback verification. |
| Persistent metadata log | TUI **L**, or `MCP_AUDIT_LOG=true` | Off by default; tool name, timestamp, duration/status and salted target hash only. No arguments, result bodies, Pine source, account data or error text are retained. |
| Watchlist groups/sections | `watchlist_get_sections`, `watchlist_create_section`, `watchlist_move_to_section` | Read and write separately; native ### groups, original order preserved, optional expected_revision from the read receipt. |
| Intraday replay | `replay` start with offset/Z ISO date or separate Unix-second `timestamp` | Date-only inputs remain UTC midnight. Timezone-ambiguous intraday strings, conflicting inputs and milliseconds-as-seconds are rejected. |

History requests and CDP calls are bounded. Configure the process environment `TV_CDP_TIMEOUT_MS` (default 10000, allowed 100–120000 ms) and `TV_CDP_TARGET_ID` when launching a CLI process. Dead or timed-out connections are invalidated; an uncertain mutation is never automatically repeated. Native tab-bar operations fail if multiple shell windows cannot be safely associated with the selected chart. This restriction does not prevent targeted chart reads/writes.

Watchlist operations verify the exact server list after writing. The native replacement endpoint has no documented atomic compare-and-swap contract: optional revision checks and fresh preflight detect observed changes, but cannot eliminate an external race. Unconfirmed or unknown writes report `changed: null`, require a UI refresh, and never blindly retry or roll back a newer list. The grouping tools do not automatically open or refresh the panel.

The audit setting is reloaded before the next tool invocation; already-running calls retain their original sink. Process environment values override `.env`, including the TUI setting. Default location is `.local/audit/tool-calls.jsonl`, rotating at 1 MiB with at most 3 files. Optional settings are `MCP_AUDIT_LOG_PATH`, `MCP_AUDIT_MAX_BYTES` (bounded 1 KiB–10 MiB) and `MCP_AUDIT_MAX_FILES` (1–5); invalid bounds use defaults. Logs and `.local` are ignored by Git. A sink failure produces one generic warning and preserves the tool result; toggle logging off/on after correcting the destination. CLI commands also log completed operations and permission denials; interrupted long-running streams may have no completion record.

Every current tool is available from the CLI with schema validation and equivalent permissions:

```powershell
node src/cli/index.js call data_load_history --args '{"count":5000,"max_iterations":3}'
node src/cli/index.js call target_list
```

`target_select` affects its current MCP session only. A one-shot CLI command cannot persist that choice into the next process; set `TV_CDP_TARGET_ID` for subsequent CLI invocations. See [approved feature integration](docs/APPROVED_FEATURES.md) for evidence and limitations.

## Bounded IHSG/IDX screener

The separately approved `IHSG_Screen` is a Write-controlled tool. It scans at most 10 IDX symbols per call (default 5), with a bounded work budget, fixed daily timeframe and resumable next_cursor. Omitted symbols use the 951-symbol PR511 static snapshot. Its current membership date is **unknown** (`as_of: null`, current_membership_verified:false); PR publication date is provenance, not proof of membership on that date. The 12 detector rules and configurable liquidity threshold are heuristics, not a claim of future returns.

The tool temporarily switches only its session-selected chart, then requires verified symbol, timeframe and full native viewport restoration, including future whitespace. It refuses to start if an existing study is unnamed, unidentifiable or unready, and guards observable studies/drawings throughout. See the [integration incident and restoration boundary](docs/APPROVED_FEATURES.md#important-intermediate-incidents-and-restoration-boundary) before treating historical smoke results as complete chart recovery. Batch-only JSON/Markdown/XLSX reports are written under ignored `.local/ihsg` unless export_reports:false. ExcelJS is pinned; its uuid dependency is overridden to the patched compatible CommonJS version. No scan or schedule starts automatically, no arbitrary output destination is accepted, and full-universe work requires explicit repeated bounded calls. Inspect the completion and restoration receipts before continuing to another batch.

The actual one-symbol IDX smoke observed broker-normalized `IDX_DLY` data with native canonical-symbol evidence and a 600-second delay. Requested/actual feed and delay are disclosed in results and reports; D/1D aliases are normalized. The latest JSON/Markdown/XLSX report smoke passed against the current Volume-only baseline. Current membership of the full 951-symbol snapshot remains unverified, and no full-universe scan was run.

```powershell
npm run admin
# Enable the Write tool IHSG_Screen; Enter shows its bounds and parameters.
node src/cli/index.js call IHSG_Screen --args '{"symbols":["IDX:BBCA"],"limit":1,"export_reports":true}'
```

## Verification and maintenance

```powershell
npm test                   # automatically includes all *.test.js except e2e.test.js
npm run lint
npm audit
npm run test:e2e            # explicit live suite; can mutate chart/account state
node scripts/live-smoke.js  # legacy opt-in smoke, only accepts layout temp
node scripts/feature-smoke.js # new feature smoke: Volume style write/restore + bounded history
node scripts/feature-smoke.js --history-timeframe D --audit # optional daily-history proof, restores timeframe
node scripts/feature-smoke.js --replay --audit # additional explicit replay + metadata-log proof
node scripts/ihsg-smoke.js # one-symbol/report proof on the disposable temp layout
```

The normal suite includes unit and local transport tests plus existing TradingView compile-API checks. The live smoke test reads health/quotes/data/news/financials, draws and removes one line, changes and restores timeframe, and checks permission enforcement and restoration. It does not run alerts, trades, or Pine editor saves.

**v2.2.0 baseline verification:** 375 tests passed, zero failures/skips; lint passed with 0 errors and 13 existing warnings; dependency audit found zero known advisories. Live daily-history, feature/replay and one-symbol IHSG/report checks passed within the [documented evidence and incident boundaries](docs/APPROVED_FEATURES.md#final-verification). Watchlist writes have mocked proof only; the earlier missing unnamed component was not identified or recreated.

See [integration notes](docs/INTEGRATION.md) and [the PR review ledger](docs/upstream-pr-triage.md) for provenance, checks and historical feature triage and subsequent approved implementation. The full upstream history and original MIT license text are retained. Self-update follows this fork's `origin/main`, using a clean fast-forward only.
