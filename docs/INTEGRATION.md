# Integration record — 2026-11-02

## Provenance and recovery

- Fork baseline: djmad/tradingview-mcp `eb0faa5b425ced7bbbd7d81f480f38c1999c87ee`.
- Upstream: tradesdontlie/tradingview-mcp `c05b8f5755ed8e64ea242de88ddbf46aa24d56a4`. Original divergence: 3 commits ahead, 72 behind.
- Local implementation preserved in commit `67c81ee` and branch `backup/local-before-upstream` in the integration checkout. The original local code, metadata and original license file are also preserved in `../__integration/local-before-integration.zip`, outside the public repository.
- Version 2.1.0 retains fork news/fundamentals, permission administration, activity dashboard, HTTP/SSE/stdio, consolidated tool dispatchers, strict symbol identity, CSV export and known-indicator handling while merging upstream history.
- The original working folder's personal data, training files, prompts, screenshots and local client configuration are excluded from publication. The old main-folder copy remains in __2delete as requested earlier.
- To roll back, stop the MCP, use the preserved code snapshot in an isolated directory and install that snapshot's lockfile. Do not overwrite personal data or permission settings during rollback. Git history permits a reviewed revert of the merge; do not force-reset a published main branch.

## Selected upstream bug fixes

These were adapted from open PRs, not blindly merged as features:

| PR | Change |
|---|---|
| [528](https://github.com/tradesdontlie/tradingview-mcp/pull/528) | Strict boolean/string-false handling across all fork tool schemas |
| [543](https://github.com/tradesdontlie/tradingview-mcp/pull/543) | Reject misleading CLI --visible false before CDP access |
| [539](https://github.com/tradesdontlie/tradingview-mcp/pull/539) | Correct mouse button masks |
| [538](https://github.com/tradesdontlie/tradingview-mcp/pull/538) | Await drawing creation and observe the actual entity before reporting success |
| [534](https://github.com/tradesdontlie/tradingview-mcp/pull/534) | Fork-aware update ancestry checks, correct repository cwd, fresh local HEAD |
| [548](https://github.com/tradesdontlie/tradingview-mcp/pull/548) | Reject invalid numeric coercions; retain existing null-to-zero contract |
| [549](https://github.com/tradesdontlie/tradingview-mcp/pull/549) | Separate latest-bar study values from crosshair-following display values |
| [537](https://github.com/tradesdontlie/tradingview-mcp/pull/537) | Load bounded history before scrolling to older dates |
| [519](https://github.com/tradesdontlie/tradingview-mcp/pull/519) | Strip inherited Electron Node mode in child launches; report CDP launch failure |
| [491](https://github.com/tradesdontlie/tradingview-mcp/pull/491) | Locale-independent watchlist button selector (static review only) |
| [555](https://github.com/tradesdontlie/tradingview-mcp/pull/555), [522](https://github.com/tradesdontlie/tradingview-mcp/pull/522) | Real script binding transitions, unsaved-change cancellation, save/compile target guards, visible bound Monaco selection, icon-only compile controls, no Save fallback |
| [197](https://github.com/tradesdontlie/tradingview-mcp/pull/197) | Narrow adaptation: strict chart-target URL checks and live chart-API readiness; broader connection rewrites deferred |

## Fork-specific corrections

- Read-to-Custom preserves the effective selection; individual denials survive preset changes.
- Every registered tool is classified; unknown additions are blocked until classified. There are 75 tools: 33 read and 42 write.
- Permission administration displays the actual current schemas and descriptions, including the new parameters. CLI actions enforce equivalent tool permissions. Active MCP calls recheck restrictions before invoking a tool; reconnect to expose newly enabled tools. Already-running operations are not cancelled.
- Upstream strategy report preparation is exposed as the write-controlled strategy_prepare action; report reads remain non-mutating. Quotes retain the fork's no-chart-switch behavior.
- Financial queries use canonical listing symbols, resolve explicit-symbol metadata, and fall back from Desktop CORS failures to a bounded public scanner request with no session cookies. News article language is encoded as data rather than interpolated as page code.
- Restore the full original MIT license text and add the fork attribution. Replace broken documentation links and regenerate the current tool index.
- Keep dependency versions locked, declare Zod directly, and update the SDK and lint dependencies. Override the affected Hono adapter/minimatch versions. All npm lifecycle scripts were disabled during installation.
- Automatically discover all non-e2e test files so added regression tests cannot silently fall out of the normal suite.

## Verification

- Complete normal suite: **242 passed, 0 failed, 0 skipped** on Windows / Node 26.13.0. Includes local HTTP/SSE, permission/TUI, Pine safety, numeric/boolean, target selection, public compiler API and upstream regression checks.
- ESLint: **0 errors**, 13 existing unused-variable warnings. No claim of warning-free legacy source.
- npm audit: **0 known advisories**, including development dependencies, at verification time.
- Real terminal check: Read showed 33/75; switching to Custom retained 33/75 and left writes off. Quit/discard made no permission-setting changes.
- Live Streamable HTTP MCP against the user's layout named temp: 75-tool catalog; health, chart state, quote, bounded OHLCV, asset discovery, technicals, financial overview (14 fields), news (3 headlines), and study values. Created/read/deleted one horizontal drawing; changed/restored timeframe. Existing-session permission revocation and 33-tool Read catalog passed. Final chart name, symbol, resolution, type, studies and drawings matched the initial snapshot.
- Live receipts stay outside Git in __integration/live-results.json. No account alerts, trades, Pine editor new/open/save, self-update or launch termination were exercised live. Pine safety has 19 mock/DOM regression tests; English menu or DOM differences can cause a safe failure on other app versions/locales. The broad mutating e2e suite was deliberately not run.
- Secret-pattern and conflict-marker checks completed before publication. This is not a complete security audit or a guarantee that every upstream bug has been resolved.

## Full PR triage and later decisions

[All 201 open PRs](upstream-pr-triage.md) were enumerated and triaged, with review depth explicit per row: 17 complete diffs, 4 additional targeted source diffs, and body review/skimming for the remainder; 6 empty bodies received title-only review. The ledger is an inventory and triage, not 201 full code audits. Dispositions reflect this integration where updated.

Useful features reserved for later user decisions:

- [History loading without changing the viewport (512)](https://github.com/tradesdontlie/tradingview-mcp/issues/512).
- [Explicit multi-window/target ownership (61)](https://github.com/tradesdontlie/tradingview-mcp/issues/61).
- [Verified indicator style editing (526)](https://github.com/tradesdontlie/tradingview-mcp/pull/526).
- [Opt-in redacted persistent tool-call logs (506)](https://github.com/tradesdontlie/tradingview-mcp/pull/506).
- [Watchlist sections/groups (410)](https://github.com/tradesdontlie/tradingview-mcp/issues/410), currently title-level requirements only.
- [Exact intraday replay timestamps (434)](https://github.com/tradesdontlie/tradingview-mcp/pull/434).

Replay stop/live-transition behavior (532) and broader CDP deadlines/reconnection designs (411/449) remain bug candidates for a separate focused live check. None of the optional feature proposals above were implemented.
