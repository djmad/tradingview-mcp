# Approved feature integration — v2.2.0

The user approved the six shortlisted extensions, replay/live and connection stability corrections, and subsequently PR511 as `IHSG_Screen`. Code generation was delegated to subagents, with root coordination, review and final verification. The implementation was prepared on `integration/approved-features` from baseline `284bb3e`; existing upstream/fork history was preserved.

## Implementation and permission contract

There are **84 registered tools: 36 Read and 48 Write**. All nine new tools have explicit catalog entries, schema-derived TUI details and schema-validated CLI access through `tv call <tool> --args <JSON>`. Read-to-Custom preserves the effective selection. Newly disabled tools are rechecked after queueing and before actual dispatch.

- `data_load_history`: Write. Bounded total-bar/Unix-second criteria without viewport setters. Exhaustion, bounded completion and pending/unknown outcomes are distinct. A dispatched request with no observed progress cannot certify a final unchanged viewport.
- `target_list`: Read; `target_select`: Write. Each MCP session owns its pinned target and CDP client, with serialized callbacks. Lost targets fail without fallback. Only a single valid chart permits automatic pinning. Selection does not activate a window; one-shot CLI processes use `TV_CDP_TARGET_ID` rather than pretending selection persists into another process.
- `indicator_get_style`: Read; `indicator_set_style`: Write. Exact study IDs, existing allowlisted properties, bounded values, confirmed readback and explicit rollback receipts. Unsupported properties fail before mutation.
- Persistent JSONL audit: default off, TUI **L** or environment opt-in. Only tool name, time, duration/status and salted target hash are retained. Arguments, result bodies, Pine source, account details and error text are omitted. Rotation is bounded; logging failure cannot replace the tool result. `.env` configuration reloads at the next invocation; process environment overrides it.
- `watchlist_get_sections`: Read; `watchlist_create_section` / `watchlist_move_to_section`: Write. Preserve native `###` arrays/order, validate exact entries, accept an optional observed revision, use fresh preflight and exact server verification. The endpoint has no documented atomic compare-and-swap contract. Unknown/unconfirmed writes report `changed:null` and require refresh; they are not blindly retried or rolled back.
- `replay`: existing Write dispatcher. Date-only UTC remains compatible; intraday ISO inputs require an offset/Z and the separate timestamp is finite Unix seconds. Stop prefers `goToRealtime` and verifies replay-started=false and currentDate=null.
- `IHSG_Screen`: Write. Bounded, resumable daily IDX batches and batch-only JSON/Markdown/XLSX reports. No full scan, schedule or TradingView launch starts automatically. Its static 951-symbol source snapshot has an **unknown membership-as-of date**, not verified current membership.

Discovery, connection setup, CDP domain calls and cleanup have deadlines. Late sockets cannot enter caches, and uncertain mutations are not replayed. Native tab-shell helpers are bounded; multiple shells with unproven selected-chart ownership fail closed instead of choosing arbitrarily.

## Final verification

The root completed these checks against the final source revision before documentation-only completion:

| Check | Result and evidence boundary |
|---|---|
| Normal test suite | **375 passed, 0 failed, 0 skipped**, approximately 39 seconds. Includes unit, native-adapter mocks, real local HTTP MCP session isolation/disposal, queued permission revocation, audit behavior, stdio EOF cleanup, viewport, replay and IHSG/export regressions. Existing public compiler-API checks are included. |
| ESLint | **0 errors**, 13 existing unused-variable warnings; `screener/` is included in lint scope. |
| Dependency audit | **0 known advisories**, including development dependencies, at verification time. ExcelJS4.4.0 is pinned with a compatible scoped uuid11.1.1 security override. |
| Actual permission TUI | 84/84 initially; Enter displayed IHSG parameters; Read then Custom retained 36/84 with IHSG disabled. L showed audit opt-in pending. Quit/discard exited without writing `.env`. |
| Live daily-history proof | Loaded **300→350 daily bars in one page request**, preserving that daily viewport. This is actual backfill evidence; an earlier monthly EXHAUSTED receipt proved only exhaustion. |
| Latest live feature smoke | Target selection, Volume linewidth change/exact restoration, history receipt, native watchlist section read, audit metadata and all-84-tool catalog passed. Explicit replay start, verified stop and status(false/null) passed. The complete original viewport, chart identity and style were verified after cleanup. |
| Latest live IHSG smoke | One `IDX:BBCA` daily evaluation passed, actual JSON/Markdown/XLSX batch reports were generated and opened/parsed with provenance checked, and the **current Volume-only baseline** was restored exactly, including future viewport whitespace. This was one symbol, not a full 951-symbol scan. |

The observed IDX request was broker-normalized to `IDX_DLY:BBCA`, with explicit native `pro_name`/series metadata confirming the requested instrument and a reported **600-second delay**. The implementation accepts only that proven qualified relationship, not a same bare ticker on an unrelated exchange. `D`/`1D` are recognized daily-resolution aliases. Results and reports disclose the actual feed, resolution and delay; the smoke does not prove real-time market data.

Watchlist **writes were tested with mocks only**; the live proof was read-only. Pine save/new/open and account alerts/trades were not exercised by these smokes. No historical-profitability or complete current-universe-membership claim follows from the tests.

## Important intermediate incidents and restoration boundary

The initial daily-history smoke exposed the old timestamp-to-loaded-bars clamp: it could remove future whitespace from the monthly view. Its receipt correctly recorded `restored:false`. The shared viewport helper now captures logical range, bar spacing, right offset, width and layout identity, checks `expected_current` again within the same setter operation, and restores without last-bar clamping. Native calendar-forward projection repaired the older timestamp-only receipt; the root verified the exact original monthly range afterward. A subsequent replay smoke encountered a transient null logical range while the chart rebuilt. Bounded readiness polling and atomic cleanup snapshots fixed that false cleanup failure; an already exact viewport is now a verified no-op. The latest feature smoke passed.

**A separate earlier failed IHSG smoke has an unresolved component-restoration limit.** During its symbol change, a previously observable component labeled `Unnamed Study` disappeared from the study list. Its identity and departed source could not be identified, and it was not recreated. The evidence does not establish that it was a disposable replay overlay or any other particular script. Symbol, timeframe, viewport and the remaining identifiable chart structure were recovered, but that incident is **not** documented as a complete restoration of the earlier unnamed-study baseline. A one-off recovery artifact remains ignored locally and is not a product recovery script.

The scanner now refuses to begin chart writes when an existing study is unnamed, unidentifiable or unready, and guards chart type, observable study IDs and drawings during the scan and restoration. The later successful IHSG proof used the then-current **Volume-only baseline**. That successful current-baseline proof does not retrospectively prove recovery of the missing earlier component.

## Basic use and opt-in verification

Run from the project root:

```powershell
npm run admin
# Select allowed tools with Space; Enter shows current parameters.
# IHSG_Screen is a Write tool. L toggles optional audit logging; S saves.
node src/cli/index.js call target_list
# For CLI calls when multiple charts are open, set the exact TV_CDP_TARGET_ID first.
node src/cli/index.js call IHSG_Screen --args '{"symbols":["IDX:BBCA"],"limit":1,"export_reports":true}'
```

Read the screener's per-item, completion and restoration receipts before continuing with a `next_cursor`. Output paths are generated under ignored `.local/ihsg`; arbitrary destinations are not accepted. The source snapshot, 12 detector rules, liquidity threshold and incomplete-latest-bar handling are described in [screener provenance](../screener/PROVENANCE.md).

```powershell
npm test
npm run lint
npm audit
node scripts/feature-smoke.js --history-timeframe D --audit
node scripts/feature-smoke.js --replay --audit
node scripts/ihsg-smoke.js
```

These live scripts are explicit opt-ins for the disposable layout named `temp`. They perform bounded chart changes and must verify restoration; they are not automatic startup actions. The feature smoke never writes account watchlists, trades, alerts or Pine scripts. The IHSG smoke evaluates one symbol and verifies its actual reports. Local receipts and recovery artifacts remain ignored.

## Remaining limits and source proposals

Native watchlist replacement remains non-atomic with external editors and may require manual UI refresh. Indicator style support is limited to discoverable allowlisted properties. Ambiguous native shell windows are not mapped automatically. Pending historical data requests cannot be cancelled or certified complete. Undocumented or localized TradingView internals can change and fail visibly. The earlier unnamed-component incident above remains an explicit historical limitation. The historical v2.1 242-test and early v2.2 333-test results are not the final current-suite counts.

Source proposals were adapted to this fork, not imported wholesale: [history512](https://github.com/tradesdontlie/tradingview-mcp/issues/512), [targets61](https://github.com/tradesdontlie/tradingview-mcp/issues/61), [styles526](https://github.com/tradesdontlie/tradingview-mcp/pull/526), [audit506](https://github.com/tradesdontlie/tradingview-mcp/pull/506), [watchlist410](https://github.com/tradesdontlie/tradingview-mcp/issues/410), [intraday434](https://github.com/tradesdontlie/tradingview-mcp/pull/434), [IHSG511](https://github.com/tradesdontlie/tradingview-mcp/pull/511), [replay/live532](https://github.com/tradesdontlie/tradingview-mcp/pull/532), [connection411](https://github.com/tradesdontlie/tradingview-mcp/pull/411)/[449](https://github.com/tradesdontlie/tradingview-mcp/pull/449). Broader unrelated PRs remain outside the approved set.
