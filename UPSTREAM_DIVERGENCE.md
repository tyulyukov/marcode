# Upstream Divergence Log

Tracks how MarCode's `main` relates to upstream `pingdotgg/t3code:main`. Its job is to prevent every sync cycle from re-deriving the same answers to:

1. Which upstream commits have we already ported? (under possibly-different SHAs)
2. Which upstream commits are we intentionally **not** porting? (and why)
3. Which upstream commits are genuinely still pending?

Complements [`FEATURES.md`](./FEATURES.md) — that one protects MarCode-exclusive features during merges. This one protects the merge _ledger_ itself.

> Sister file: [`FEATURES.md`](./FEATURES.md) lists the features we **add** and must not lose.

---

## How to use this doc

When starting a new upstream sync:

```bash
git fetch upstream
# Strict "no patch-equivalent" set — includes ported-under-different-SHA
git cherry origin/main upstream/main | grep "^+ " | awk '{print $2}' > /tmp/raw_missing.txt

# Subtract the "already-equivalent" set below — those have different SHAs by design
# Subtract the "intentionally-skipped" set below — those we're never porting
# What remains is real work
```

Sections are ordered by action:

1. [Ported in the current cycle](#ported-in-the-current-cycle) — new SHAs on `main`
2. [Already equivalent under a different SHA](#already-equivalent-under-a-different-sha) — do **not** re-port
3. [Intentionally skipped](#intentionally-skipped) — do **not** port
4. [Pending real work](#pending-real-work) — what's actually left

---

## Ported in the current cycle

**Cycle:** 2026-05-01 · Baseline before cycle: `9e2182c25` · Baseline after cycle: `dc9f2bfbd`

### marcode/upstream-quick-fixes — upstream quick-fix sync (2026-05-01)

| Upstream                                               | Subject                                                                        | New SHA     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------- |
| [#2176](https://github.com/pingdotgg/t3code/pull/2176) | fix: updated UI "add project" icon to match the command palette icon           | `e8806f001` |
| [#2408](https://github.com/pingdotgg/t3code/pull/2408) | \[codex\] Fix visited timestamp under clock skew                               | `6854d2fce` |
| [#2411](https://github.com/pingdotgg/t3code/pull/2411) | \[codex\] fix terminal dimension validation                                    | `babb286ec` |
| [#2404](https://github.com/pingdotgg/t3code/pull/2404) | fix(server): key AskUserQuestion answers by question text                      | `d830a702b` |
| [#1652](https://github.com/pingdotgg/t3code/pull/1652) | fix(web): prevent iOS Safari auto-zoom on input focus                          | `18d7f0c67` |
| [#1966](https://github.com/pingdotgg/t3code/pull/1966) | fix(git): hide stale merged/closed PRs on the default branch                   | `691096c7f` |
| [#2413](https://github.com/pingdotgg/t3code/pull/2413) | fix(web): allow closing diff panel in non-git projects                         | `6a7d84c40` |
| [#1293](https://github.com/pingdotgg/t3code/pull/1293) | fix(web): hide mobile sidebar after thread selection or creation               | `71f5697f2` |
| [#2423](https://github.com/pingdotgg/t3code/pull/2423) | fix(web): make thread archive button always visible on mobile                  | `444f0e85d` |
| [#2409](https://github.com/pingdotgg/t3code/pull/2409) | Narrow the right sidebar and update task panel and diff panel                  | `b44ec8829` |
| [#2392](https://github.com/pingdotgg/t3code/pull/2392) | fix(web): respect iOS safe areas across mobile chrome & other mobile fixes     | `047e9eed9` |
| [#2427](https://github.com/pingdotgg/t3code/pull/2427) | fix: bump `electron` version to v40.9.3 and add it to our trusted dependencies | `8dea3fe31` |
| [#2420](https://github.com/pingdotgg/t3code/pull/2420) | fix(mobile): enable touch scrolling in file picker modal                       | `e67f4fc16` |
| [#2183](https://github.com/pingdotgg/t3code/pull/2183) | fix: opencode is not on PATH on Windows                                        | `dc9f2bfbd` |

**Conflict resolutions applied:**

- `ChatView.tsx` (#2408) — kept MarCode's `markThreadVisited(serverThread.id, ...)` call shape because MarCode keys `threadLastVisitedAtById` by raw `serverThread.id` (line 770), not upstream's `scopedThreadKey(scopeThreadRef(...))`. Adopted upstream's second arg (`activeLatestTurn.completedAt`) to fix the clock-skew issue.
- `ComposerPromptEditor.tsx` + `Sidebar.tsx` (#1652) — MarCode already had a 16px iOS-zoom fix from `207e3ed60` (`text-[16px] sm:text-[14px]`); took upstream's `text-base sm:text-[14px]` formulation and `wrap-break-word` migration (Tailwind v4 idiom replacing `break-words`) for canonical phrasing.
- `GitManager.ts` (#1966) — MarCode HEAD already had the `isDefaultBranch && state !== "open"` guard (independently added in `207e3ed60`) but inside MarCode's GitLab-aware `Effect.all` parallel block. Only added upstream's clarifying comment. Test file's `marcode-git-manager-` tempdir prefix was kept (vs upstream's `t3code-`).
- `Sidebar.tsx` + `SettingsSidebarNav.tsx` + `routes/settings.tsx` (#2423) — kept MarCode's `md:` breakpoint pattern for the multi-environment indicator (instead of upstream's `max-sm:`-based always-visible-on-mobile pattern; functionally equivalent), but adopted upstream's `text-muted-foreground/60` contrast tweak. SettingsSidebarNav imports merged: kept MarCode's `PaletteIcon` import (FEATURES.md "Theme System: Appearance settings tab"), added upstream's `useCallback` + `useCanGoBack`.
- `SettingsPanels.tsx` (#2409) — kept MarCode's `descriptors`-based `changedSettingLabels` pattern. Upstream's "Auto-open task panel" SettingsRow was dropped because MarCode removed the `autoOpenPlanSidebar` row from the UI entirely (the schema field still exists for backwards compat but is no longer user-configurable).
- `ChatHeader.tsx` (#2392) — combined MarCode's relative-timestamp imports (`formatRelativeTimeLabel`, `useSyncedRelativeTimeTick`) with upstream's `usePrimaryEnvironmentId` import; combined hook calls in the function body so both sets of state are derived. MarCode HEAD's existing `isRemoteEnvironment` reference (line 158) now resolves correctly.
- `index.css` (#2392) — both MarCode's reduce-motion overrides and upstream's `@utility pt-safe / pb-safe / pl-safe / pr-safe` blocks coexist (independent additions, no overlap).
- `BranchToolbar.tsx` (#2392) — kept MarCode's `@marcode/client-runtime` / `@marcode/contracts` rebrand imports; added upstream's new `lucide-react` icon imports (`ChevronDownIcon`, `CloudIcon`, `FolderGit2Icon`, `FolderGitIcon`, `FolderIcon`, `MonitorIcon`).
- `BranchToolbarBranchSelector.tsx` (#2392) — preserved MarCode's `GitBranchIcon`; took upstream's `min-w-0` + `shrink-0` polish.
- `ChatView.tsx` (#2392) — MarCode's inline composer structure differs substantially from upstream's `ChatComposer`-extracted version. Resolved to keep MarCode's structure entirely; manually backported the safe-area-inset paddings to MarCode's header outer wrapper (web-only, electron path unchanged so traffic-light logic survives) and to MarCode's input-bar wrapper. The `isGitRepo`-conditional `BranchToolbar` placement was kept outside the input-bar `<div>` (where MarCode renders it) instead of upstream's nested-inside placement.
- `routes/_chat.$environmentId.$threadId.tsx` + `routes/_chat.draft.$draftId.tsx` (#2392) — adopted upstream's `h-svh min-h-0 ... md:h-dvh` height pattern (better mobile chrome handling). Kept MarCode's two-arg `<ChatView threadId={...} environmentId={...}>` call sites and intentionally did not adopt upstream's `routeKind` / `onDiffPanelOpen` / `draftId` props (per [MEMORY.md] notes about MarCode lacking the `routeKind` prop, and `retainThreadDetailSubscription` ownership).
- `package.json` (#2427) — kept MarCode HEAD's existing `["electron", "node-pty"]` order (already present from a previous bump); upstream's identical entry just rearranged.

**Skipped:**

- [#2277](https://github.com/pingdotgg/t3code/pull/2277) `feat: Multi-Provider support` — explicit user instruction; out of scope for this quick-fix cycle.

---

## Previous cycle: 2026-04-28

**Baseline before cycle:** `7f04a4a11` · **Baseline after cycle:** `ef574febf`

### PR #72 — upstream sync (2026-04-28)

| Upstream                                               | Subject                                                    | New SHA     |
| ------------------------------------------------------ | ---------------------------------------------------------- | ----------- |
| [#2364](https://github.com/pingdotgg/t3code/pull/2364) | fix(release): use configured node for smoke manifest merge | `2f1e3cc3c` |
| [#2372](https://github.com/pingdotgg/t3code/pull/2372) | Ignore stale WebSocket lifecycle events after reconnect    | `b408a6857` |

**Conflict resolutions applied:** None — both upstream commits cherry-picked cleanly. Patch context for `wsTransport.ts` / `protocol.ts` / `wsTransport.test.ts` matched MarCode HEAD exactly; only delta is the rebrand strings (`@marcode/contracts`, `"Unable to connect to the MarCode server WebSocket."`), untouched by upstream. `release-smoke.ts` line 260 matched at offset (file is shorter in MarCode because of the removed nightly-channel block, but the heredoc context is identical).

**Note on upstream's new `isActive` socket-session gate:** The new `WsProtocolLifecycleHandlers.isActive?` callback in `protocol.ts` lives at the **socket session** layer (per-session id check inside `WsTransport.createSession`). It is distinct from the existing **per-stream** `isActive` parameter on `runStreamOnSession` in `wsTransport.ts` — they don't collide functionally but a future reader could conflate them.

**Bundled non-upstream commit (out-of-cycle, co-shipped):** `ef574febf feat(provider): subagent task events, cursor allow_once, ACP outgoing logging` — backfill subagent test coverage for `7f04a4a11` (`task.progress` with `lastToolName` / `summary`, child-thread delta suppression), Cursor `allow_once` preference for auto-approval (preserves command-text visibility against the empty-`rawInput` Cursor server bug), and `effect-acp` `sendNotification` rewired through `logProtocol` + JSON-RPC encoding to match request/response paths.

---

## Previous cycle: 2026-04-24

**Baseline before cycle:** `7c430aece` · **Baseline after cycle:** `ececcdcb1`

### Direct-to-main (no PR, user-approved)

| Upstream                                               | Subject                                                          | New SHA     |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ----------- |
| [#1198](https://github.com/pingdotgg/t3code/pull/1198) | fix(web): prevent composer controls overlap on narrow windows    | `f6fc7071f` |
| [#2224](https://github.com/pingdotgg/t3code/pull/2224) | fix: Change right panel sheet to be below title bar / action bar | `ec46a66a2` |
| [#1934](https://github.com/pingdotgg/t3code/pull/1934) | chore(desktop): separate dev AppUserModelID on Windows           | `0740d14d5` |
| [#1951](https://github.com/pingdotgg/t3code/pull/1951) | fix(web): allow concurrent browser tests to retry ports          | `569891444` |
| [#2095](https://github.com/pingdotgg/t3code/pull/2095) | \[codex\] Fix Windows release manifest publishing                | `9e3091d3a` |
| [#2100](https://github.com/pingdotgg/t3code/pull/2100) | ci(release): install deps before finalize version bump           | `1a179b852` |

### PR #66 — low-risk t3code fixes

| Upstream                                               | Subject                                                  | New SHA     |
| ------------------------------------------------------ | -------------------------------------------------------- | ----------- |
| [#1651](https://github.com/pingdotgg/t3code/pull/1651) | Add IntelliJ project icon to favicon paths               | `1fe62b7ef` |
| [#1975](https://github.com/pingdotgg/t3code/pull/1975) | docs: Document environment prep before local development | `19c4c50c5` |
| [#2152](https://github.com/pingdotgg/t3code/pull/2152) | fix(server): detect localized Windows command errors     | `dd7ddce10` |
| [#2292](https://github.com/pingdotgg/t3code/pull/2292) | Fix Claude session cwd resume drift                      | `4a621a587` |
| [#2301](https://github.com/pingdotgg/t3code/pull/2301) | fix(web): ignore stale runtime projection snapshots      | `5d2f1604d` |
| [#2311](https://github.com/pingdotgg/t3code/pull/2311) | fix(request-permission): add `dynamic_tool_call`         | `7dd31b6cb` |
| [#2313](https://github.com/pingdotgg/t3code/pull/2313) | Exclude subscribe RPCs from latency tracking             | `af5012a92` |

**Conflict resolutions applied:**

- `ChatView.tsx` — kept `@marcode/shared/git` + upstream `useMediaQuery` / `RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY` imports side-by-side.
- `main.ts` (desktop) — applied upstream's dev/prod `APP_USER_MODEL_ID` split to MarCode's namespace: `com.marcode.marcode.dev` / `com.marcode.marcode`.
- `release-smoke.ts` — kept upstream's `assertExists` / `assertMissing` helpers, kept `marcode-release-smoke-` tempdir prefix.
- `ProviderService.ts` (#2292) — dropped the upstream `analytics.record("provider.session.started", …)` call; MarCode has no analytics (see [FEATURES.md §"Telemetry Removal"](./FEATURES.md#telemetry-removal)).
- `ProviderService.test.ts` — swapped `AnalyticsService.layerTest` → `AnalyticsServiceNoopLive` (MarCode exposes only a noop).
- `ProviderCommandReactor.test.ts` ("restarts the provider session when the thread workspace changes") — replaced the hardcoded `/tmp/provider-project-worktree` with a real `mkdtempSync` dir, because MarCode's `ProviderCommandReactor.ts:302` auto-archives threads with missing worktree paths (MarCode behavior: [#54e6ddc2](https://github.com/tyulyukov/marcode/commit/54e6ddc2) "Handle missing worktree directories gracefully"). Without a real dir the session restart short-circuits to auto-archive and the test times out.

### PR #67 — toast close buttons

| Upstream                                               | Subject                     | New SHA     |
| ------------------------------------------------------ | --------------------------- | ----------- |
| [#2023](https://github.com/pingdotgg/t3code/pull/2023) | Add close buttons to toasts | `bb5d51097` |

**Conflict resolutions applied:**

- `toast.tsx` — took upstream's version wholesale (492 → 719 lines). Upstream already bundled `CopyErrorButton` at line 93, so no manual re-integration needed.
- `Sidebar.tsx` — preserved MarCode's "Delete anyway" warning toast flow (action button → deferred close → `api.dialogs.confirm` with thread-count messaging → `removeProject({ force: true })` → inline error toast). Wrapped all toast calls via the new `stackedThreadToast(...)` helper for layout consistency.

### PR #68 — cycle ledger bootstrap

Introduced this doc. No upstream PR; meta-work that codifies the "Already equivalent" / "Intentionally skipped" sets so future cycles don't re-derive them.

New SHA: `ee646a654`.

### PR #69 — sidebar row timestamp (part 1 of upstream #1996)

| Upstream                                               | Subject                                                  | New SHA     |
| ------------------------------------------------------ | -------------------------------------------------------- | ----------- |
| [#1996](https://github.com/pingdotgg/t3code/pull/1996) | Use latest user message time for thread timestamps (row) | `524e93afd` |

Narrow behavioral port: `Sidebar.tsx:715` thread-row label now falls back `thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt`. Matches the helper already in `CommandPalette.logic.ts:161`. Preserves MarCode's structural-sharing event handling ([FEATURES.md §"Incremental Event Handling"](./FEATURES.md#incremental-event-handling--structural-sharing)).

### PR #70 — shell-stream authority for sidebar summary (part 2 of upstream #1996)

| Upstream                                               | Subject                                                             | New SHA     |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ----------- |
| [#1996](https://github.com/pingdotgg/t3code/pull/1996) | Use latest user message time for thread timestamps (store refactor) | `506b808c2` |

**Correctness fix, not cleanup.** Removes the client-derived `buildSidebarThreadSummary` path in `store.ts` that was overwriting server-authoritative sidebar flags (`hasPendingApprovals`, `hasPendingUserInput`, `hasActionableProposedPlan`, `latestUserMessageAt`) during every detail-stream write. Matches the stream-separation contract MEMORY.md requires (guards against "ghost Pending Approval badges on resolved threads"). Tests in `store.test.ts` describe block "shell events are authoritative for sidebar summary flags" rewritten to assert the new contract: detail stream must not touch sidebar; shell stream is the sole writer.

What we deliberately did NOT port from upstream #1996: structural reorganization of `store.ts` (commentary, `ensureThreadRegistered` extraction, `retainThreadScopedRecord` changes). MarCode's Incremental Event Handling & Structural Sharing (FEATURES.md §1) already covers the functional behavior; upstream's cosmetic reshuffle is net risk for no gain.

### PR #71 — provider model selection option arrays (upstream #2246)

| Upstream                                               | Subject                                             | New SHA                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [#2246](https://github.com/pingdotgg/t3code/pull/2246) | Refactor provider model selections to option arrays | `d776a9d12` + `62fd6ea4b` + `b7f903e7e` + `e2601893d` + `5f75e700d` + `c1bce4fb7` + `9bb54da84` (A→E + formatter + test-alignment follow-up) |

**Why ported:** forward compatibility with upstream's `provider-instance-registry` branch (`ceddb40 / 7a466f / 8a82b53 / 84b0d74`), which extends the new option-array shape. Any future sync that touches provider identity assumes #2246 is in.

**Key deviations from upstream:**

- Migration id renumbered `026 → 030` because MarCode already uses `26_AuthSessionLastConnectedAt`. Current head after port: `030_CanonicalizeModelSelectionOptions`.
- `RoutingTextGeneration.ts` — kept MarCode's Claude→Codex fallback branching intact (FEATURES.md §"Claude-Powered Text Generation"); only the option access was retrofitted with `getModelSelectionStringOptionValue` / `getModelSelectionBooleanOptionValue` helpers.
- `ClaudeTextGeneration.ts` — preserved MarCode's fork-exclusive progressive generation code path.
- `composerProviderRegistry.tsx` (deleted upstream) — local additions hand-ported into the new `composerProviderState.tsx` rather than deleted.
- `ProviderModelPicker.browser.tsx` + `composerDraftStore.ts` — near-total hand-rebuild since upstream ±399 LoC collides with MarCode's +397 LoC delta.
- All new test layers routed through `AnalyticsServiceNoopLive` (no upstream `AnalyticsService.layerTest`).

**Post-merge hotfix** (on main, direct commits): `composerDraftStore.ts` gained `normalizeModelSelectionByProviderMap` to coerce legacy object-shape `options` blobs in pre-existing v5 localStorage (migration 030 only touches SQLite — persisted drafts in the browser store needed a separate runtime normalizer). Regression guard in `composerDraftStore.test.ts` under `describe("composerDraftStore legacy modelSelection options migration")`.

**Phase 4 smoke** (real dev DB, 2026-04-24): migration 030 applied cleanly — 155 `projection_threads` rows canonicalized, 0 legacy-shape survivors across `projection_threads`, `projection_projects`, and `orchestration_events` (`project.{created,meta-updated}`, `thread.{created,meta-updated,turn-start-requested}`).

---

## Already equivalent under a different SHA

These upstream PRs are **behaviorally present** in MarCode via non-identical patches. `git cherry` flags them as missing because patch-ids differ. **Do not re-port.**

| Upstream                                               | Subject                                                                | MarCode equivalent                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1541](https://github.com/pingdotgg/t3code/pull/1541) | fix(claude): emit plan events for TodoWrite during input streaming     | `f4719a05f feat(tool-activity): TodoWrite → plan sidebar + apply_patch → file-change for Cursor/OpenCode` — generalized via `@marcode/shared/toolActivity` with `isTodoWriteTool` + `extractPlanStepsFromTodos` re-exported in `ClaudeAdapter.ts:48` and also used in Cursor / OpenCode adapters.                                                                                                                                                        |
| [#1944](https://github.com/pingdotgg/t3code/pull/1944) | feat(web): add tooltip to composer file mention pill                   | Already present in `ComposerPromptEditor.tsx` from earlier merge. Cherry-pick was an empty diff except for an unrelated `PasteCommandType` import differing.                                                                                                                                                                                                                                                                                             |
| [#1953](https://github.com/pingdotgg/t3code/pull/1953) | Migrate chat scrolling and branch lists to LegendList                  | `f3670b839 perf(chat): restore LegendList virtualization for message timeline` — restored after an earlier merge lost it.                                                                                                                                                                                                                                                                                                                                |
| [#1996](https://github.com/pingdotgg/t3code/pull/1996) | Use latest user message time for thread timestamps                     | Ported across two PRs in this cycle: `524e93afd feat(sidebar): latestUserMessageAt for thread row timestamp (upstream #1996)` (PR #69, behavioral) + `506b808c2 fix(store): enforce shell-stream authority for sidebar summary flags (upstream #1996)` (PR #70, correctness refactor — deletes the detail-stream-derived `buildSidebarThreadSummary`). The earlier `917ab971b Remove unnecessary export from getThreadSortTimestamp` was unrelated prep. |
| [#2001](https://github.com/pingdotgg/t3code/pull/2001) | Warm sidebar thread detail subscriptions                               | `e82a9cf52 feat(sidebar): restore thread snapshot prewarming` — different implementation (snapshot prewarm in Sidebar), achieves same UX goal. **Per [MEMORY.md]**: do NOT add `retainThreadDetailSubscription` to `ChatView.tsx`.                                                                                                                                                                                                                       |
| [#2002](https://github.com/pingdotgg/t3code/pull/2002) | Fix thread timeline autoscroll and simplify branch state               | `fb41df9bd feat(timeline): auto-follow bottom when content grows` — ResizeObserver-based MarCode implementation.                                                                                                                                                                                                                                                                                                                                         |
| [#2024](https://github.com/pingdotgg/t3code/pull/2024) | Add filesystem browse API and command palette project picker           | `b9ef378e9 feat: unify add-project/add-folder on Cmd+K filesystem picker (upstream #2024)` — explicit port.                                                                                                                                                                                                                                                                                                                                              |
| [#2055](https://github.com/pingdotgg/t3code/pull/2055) | feat: configurable project grouping                                    | `6673ca823 feat(sidebar): configurable project grouping (port upstream #2055)` — explicit port + `3dae9e63b chore(web): port path normalization helpers (prereq)`.                                                                                                                                                                                                                                                                                       |
| [#2072](https://github.com/pingdotgg/t3code/pull/2072) | feat: add Claude Opus 4.7 to built-in models                           | `788194665` + `4c32418a2` + `18216a500` + `10bdc1225` — full stack including default-effort tweaks.                                                                                                                                                                                                                                                                                                                                                      |
| [#2099](https://github.com/pingdotgg/t3code/pull/2099) | guard against missing sidebarProjectGroupingOverrides                  | `c5f4c9115 fix(sidebar): handle undefined sidebarProjectGroupingOverrides on stale settings` — stricter version of the same fix (handles raw JSON decode).                                                                                                                                                                                                                                                                                               |
| [#2153](https://github.com/pingdotgg/t3code/pull/2153) | Redesign model picker with favorites and search                        | `41ddce8f0 feat(model-picker): port upstream sexy redesign with favorites and search` — explicit port.                                                                                                                                                                                                                                                                                                                                                   |
| [#2192](https://github.com/pingdotgg/t3code/pull/2192) | fix(server): prevent probeClaudeCapabilities from wasting API requests | Already present: `waitForAbortSignal` + `SDKUserMessage` never-yielding prompt in `ClaudeProvider.ts:485,514`. Cherry-pick diff is empty against our HEAD.                                                                                                                                                                                                                                                                                               |
| [#2255](https://github.com/pingdotgg/t3code/pull/2255) | fix(server): restore CODEX_HOME tilde expansion for Codex launches     | `expandHomePath` already wired on `CodexProvider.ts:226` and `CodexSessionRuntime.ts:688` via [#2210](https://github.com/pingdotgg/t3code/pull/2210) + follow-ups (`63ea04e29`, `42afbb226`).                                                                                                                                                                                                                                                            |
| [#2419](https://github.com/pingdotgg/t3code/pull/2419) | fix(web): make new thread button always visible on mobile              | MarCode independently solved this in `207e3ed60 feat(composer): refactor mention node ...` (Apr 14) using a `md:` breakpoint inversion (`pointer-events-auto absolute ... md:pointer-events-none md:opacity-0 md:group-hover:...:opacity-100`) — semantically equivalent to upstream's `max-sm:` pattern but inverted. Cycle 2026-05-01 cherry-pick was skipped via `git cherry-pick --skip`.                                                            |
| Direct                                                 | Stop OpenCode refresh from leaking serve processes (`35822884d`)       | `1feaf81b5 / 71199bbb7` — already ported earlier (detected by `git cherry`'s patch-id match, did not appear in 2026-05-01 missing list).                                                                                                                                                                                                                                                                                                                 |

**Verification strategy for re-checking in a later cycle:** grep for the symbol the upstream PR adds. If it's already in MarCode, confirm; do not cherry-pick.

---

## Intentionally skipped

These upstream commits are **never** to be ported unless MarCode's release pipeline adopts the underlying infrastructure. Moving them in creates conflicts without value.

### Blacksmith runners (skipped)

MarCode uses GitHub-hosted runners. Blacksmith adoption would require account setup, billing, and pipeline changes that aren't on the roadmap.

- [#2101](https://github.com/pingdotgg/t3code/pull/2101) `try out blacksmith for releases`
- [#2103](https://github.com/pingdotgg/t3code/pull/2103) `Revert to Github Runner for Windows` — no-op since blacksmith never adopted
- [#2129](https://github.com/pingdotgg/t3code/pull/2129) `Modernize release workflow runners` — the actual migration commit
- [#2146](https://github.com/pingdotgg/t3code/pull/2146) `Guard release workflow jobs from upstream failures` — context depends on blacksmith runners
- [#2147](https://github.com/pingdotgg/t3code/pull/2147) `Guard release workflow jobs on upstream success` — same

### Nightly release channel (skipped)

MarCode ships semver alphas (`1.0.0-alpha.*`), not nightly builds. Adopting nightlies would fragment the update channel.

- [#2012](https://github.com/pingdotgg/t3code/pull/2012) `Nightly release channel`
- [#2025](https://github.com/pingdotgg/t3code/pull/2025) `Fix nightly desktop product name`
- [#2049](https://github.com/pingdotgg/t3code/pull/2049) `Default nightly desktop builds to the nightly update channel`
- [#2134](https://github.com/pingdotgg/t3code/pull/2134) `Throttle nightly release workflow to every 3 hours`
- [#2186](https://github.com/pingdotgg/t3code/pull/2186) `fix(release): use v<semver> tag format for nightly releases`

### Fork-specific release operations (skipped)

- [#2149](https://github.com/pingdotgg/t3code/pull/2149) `Use GitHub App token for release uploads` — requires `RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY` secrets configured for the t3tools org, not the fork.
- `2d87574e` `chore(release): prepare v0.0.20` — bumps to upstream's 0.0.x version scheme, collides with MarCode's `1.0.0-alpha.*`.
- `ada410bc` `chore(release): prepare v0.0.21` — same.

### Upstream-only docs / rosters (skipped)

- [#2154](https://github.com/pingdotgg/t3code/pull/2154) `Add OpenCode to README` — upstream's README is divergent from MarCode's marketing-oriented README; not worth re-adding the line.
- [#2425](https://github.com/pingdotgg/t3code/pull/2425) `Add new GitHub users to VOUCHED.td` — upstream's volunteer roster file; doesn't apply to the fork.

### Multi-Provider support (deferred, not skipped permanently)

- [#2277](https://github.com/pingdotgg/t3code/pull/2277) `feat: Multi-Provider support` — deferred from the 2026-05-01 cycle on user instruction (too large for a quick-fix sync). Revisit in a dedicated cycle when MarCode is ready to integrate the multi-provider model.

---

## Pending real work

_None as of 2026-05-01._ All actionable upstream commits in the new range (`9e2182c25..1eb6fcea8`, 18 commits flagged by `git cherry`) landed via the `marcode/upstream-quick-fixes` branch except: `#2277` (deferred — see "Multi-Provider support" above), `#2154` and `#2425` (upstream-only docs/rosters), and `#2419` (already-equivalent under MarCode's `md:` inversion pattern). Re-run the `git cherry origin/main upstream/main` workflow at the top of this doc when starting the next cycle.

---

## Merging workflow (lessons from this cycle)

1. **Cherry-pick, don't merge.** A single `git merge upstream/main` produces a wall of conflicts on FEATURES.md-protected files, because MarCode has re-implemented many upstream commits under different SHAs. Cherry-pick individual PRs or small logical groupings into `marcode/port-*` branches.
2. **Use `git cherry-pick -x`.** The `(cherry picked from commit <sha>)` trailer is the fork's audit trail.
3. **Always run `bun run typecheck` + `apps/*/vitest run` locally before pushing.** CI surprises from telemetry-removal leftovers and MarCode-specific behaviors (worktree auto-archive, structural sharing) are common.
4. **Skip-list over port-list.** This doc's `Already equivalent` and `Intentionally skipped` sections save more time on the _next_ cycle than any single port. Keep it honest.
5. **Preserve FEATURES.md exclusives by hand.** Upstream refactors (see PR #67 `Sidebar.tsx` resolution) often simplify flows we deliberately made richer. Re-wire the richer flow through any upstream helper rather than reverting to the simpler variant.
