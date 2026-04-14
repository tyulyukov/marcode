# MarCode Project Guidelines

## GitHub Repository

- **Origin**: `tyulyukov/marcode` (this is the main repo for CI checks)
- **Upstream**: `pingdotgg/t3code` (the fork source — do NOT check CI here, do NOT reference upstream branding)
- When checking CI status, always use `--repo tyulyukov/marcode` with `gh` commands.

## Rebrand Note

This project was forked from upstream and fully rebranded to MarCode. When merging upstream changes, always check for and replace any remaining upstream references, and **reject reintroduction of JS virtualization in `MessagesTimeline.tsx`** (see "Timeline rendering" section under Performance):

- Package imports: `@marcode/contracts`, `@marcode/shared/*` (never `@t3tools`)
- Env vars: `MARCODE_` prefix (never `T3CODE_`)
- Branch prefixes in tests: `marcode/` (never `t3code/`)
- Test file prefixes: `marcode-` (never `t3-`)
- User-facing strings: "MarCode" (never upstream branding)
- Monorepo name in `bun.lock`/`package.json`: `@marcode/monorepo`

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, `bun typecheck` and all relevant tests must pass before considering tasks completed.
- Do NOT run `bun run build` — typecheck is sufficient for validation.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

MarCode is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Research-First Rule

When working with Claude API/SDK, Codex, Electron, or any external library/API, **always fetch and read the official documentation first** (via context7 or web fetch) before writing any integration code. Do not guess at API shapes, event names, or configuration options from memory — docs may have changed. This applies especially to:

- Claude API / Anthropic SDK / Claude Agent SDK
- Codex App Server protocol and JSON-RPC methods
- Electron APIs (BrowserWindow, screen, ipcMain, etc.)
- Any third-party library or service integration

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@marcode/shared/git`) — no barrel index.

## Codex App Server (Important)

MarCode is currently Claude-first (Claude is the default provider). The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Performance: State & Rendering Architecture

### Two-Phase Bootstrap (`__root.tsx`, `store.ts`, `ProjectionSnapshotQuery.ts`)

The initial data load uses a **two-phase bootstrap** to render the sidebar immediately:

1. **Phase 1 — Listing Snapshot** (`getListingSnapshot()`): Fetches projects + lightweight `OrchestrationThreadSummary` (thread metadata, sessions, latest turns, pre-computed `latestUserMessageAt` via SQL aggregate). Skips messages, activities, checkpoints, and proposed plans. Sets `bootstrapComplete = true` so the sidebar renders immediately. Threads in the store are "hollow" (empty `messages[]`, `activities[]`, etc.).

2. **Phase 2 — Lazy Thread Hydration** (`getThread(threadId)`): When the user navigates to a thread, `_chat.$threadId.tsx` checks `isThreadHydrated()` (messages exist or no turn has happened). If hollow, it calls `getThread()` to fetch full data for that single thread and calls `hydrateThread()` to replace the hollow thread in the store.

Sidebar summary fields (`hasPendingApprovals`, `hasPendingUserInput`, `hasActionableProposedPlan`) default to `false` in the listing snapshot — real-time domain events correct these for active threads within seconds.

Full `getSnapshot()` remains available as a fallback for `replay-failed` snapshot recovery.

### Incremental domain event application (`__root.tsx`, `store.ts`)

High-frequency events (`thread.message-sent`, `thread.activity-appended`, `thread.session-set`, `thread.turn-diff-completed`, `thread.proposed-plan-upserted`) are applied **incrementally** to the Zustand store from event payloads — no full snapshot fetch. This avoids blocking the main thread with JSON parsing and object reconstruction during active agent work.

Full snapshot sync (`getSnapshot()`) only runs for:

- Sequence gaps (missed events)
- Deferred reconciliation safety net (every 10 seconds after last incremental event)
- Welcome/reconnect
- Watchdog (15s stale session threshold)

When adding new event types, decide whether they should be handled incrementally (add to `INCREMENTAL_EVENT_TYPES` set and add a store `apply*` function) or via snapshot sync.

### Store structural sharing (`store.ts`)

`syncServerReadModel` uses structural sharing: when a snapshot arrives, each thread/project is compared field-by-field against the previous version. If nothing changed, the **same object reference** is returned. This prevents unnecessary Zustand subscriber re-renders. When adding new fields to `Thread` or `Project`, update `threadChanged()` / `projectChanged()` accordingly.

### ChatView selectors

ChatView uses **fine-grained Zustand selectors** (one per thread/project ID) instead of subscribing to the full `threads`/`projects` arrays. This means changes to other threads don't cause the active chat to re-render. When adding new store-dependent logic in ChatView, always use a targeted selector.

### Composer isolation

`ComposerPromptEditor` stays responsive during agent work because:

- Its volatile dependencies (`activePendingProgress`, `activePendingUserInput`, `composerTerminalContexts`, `composerJiraTaskContexts`) are accessed via **refs** in callbacks, not in the `useCallback` dependency array.
- Fallback empty arrays use **module-level constants** (`EMPTY_TERMINAL_CONTEXT_DRAFTS`, `EMPTY_JIRA_TASK_DRAFTS`) instead of inline `[]`.

### Timeline rendering: NO JS virtualization (`MessagesTimeline.tsx`)

**CRITICAL — DO NOT REINTRODUCE `@tanstack/react-virtual` or any JS virtualizer for the messages timeline.** This has been deliberately removed twice. Upstream uses `useVirtualizer` with absolute positioning + `transform: translateY()`, but it causes persistent message overlap and scroll lag in MarCode because:

- Variable-height messages (markdown, code blocks, images, expandable diffs, quoted contexts) make height estimation fundamentally inaccurate
- Async content (Suspense code highlighting, image loads) changes height after initial measurement
- Expandable/collapsible sections (Show full diff, work groups) change height without virtualizer notification
- `ChatView.tsx` directly manipulates `scrollTop` for interaction anchoring and auto-scroll, which desynchronizes from the virtualizer's internal scroll state
- `SelectionReplyToolbar` wraps every assistant message in extra DOM, adding unmeasured height

**Instead, we use CSS `content-visibility: auto`** with `contain-intrinsic-block-size` hints. All rows render in normal document flow — overlap is physically impossible. The browser natively skips painting offscreen content, giving equivalent performance without the positioning bugs. Height estimates in `timelineHeight.ts` feed into `containIntrinsicBlockSize` for accurate scrollbar sizing.

When merging upstream changes that touch `MessagesTimeline.tsx`, **reject any reintroduction of `useVirtualizer`, `measureElement`, `VirtualItem`, absolute-positioned row containers, or `shouldAdjustScrollPositionOnItemSizeChange`**. Keep the `content-visibility: auto` rendering path.

### Timeline row memoization (`MessagesTimeline.tsx`)

Each timeline row renders through a `memo`'d `TimelineRowContent` component (not an inline function). When adding new row types or modifying row rendering, keep the logic inside `TimelineRowContent` to preserve per-row memoization.

## Git Host Provider Abstraction (GitHub + GitLab)

MarCode supports both GitHub and GitLab (including self-hosted instances) for PR/MR operations. The integration is provider-agnostic:

- `GitHostCli` (service contract in `apps/server/src/git/Services/GitHostCli.ts`) defines the abstract interface.
- `GitHubCli` layer wraps `gh` CLI, `GitLabCli` layer wraps `glab` CLI.
- `RoutingGitHostCli` auto-detects the provider from `remote.origin.url` hostname, with fallback to `git config marcode.gitHostProvider github|gitlab` and CLI auth probing.
- `GitManager` depends only on `GitHostCli` — never on a specific provider.
- The web UI dynamically shows "PR" or "MR" labels based on `gitHostProvider` from `GitStatusResult`.
- Fork-based MR workflows for GitLab are deferred (graceful error).

When adding new git-host-specific functionality, implement it in both `GitHubCli.ts` and `GitLabCli.ts` layers behind the `GitHostCliShape` interface.

## Tailwind v4 Pitfall: `px-*` vs `pl-*`/`pr-*`

This project uses Tailwind CSS v4. In v4, `px-*` generates `padding-inline` (a logical CSS property) while `pl-*`/`pr-*` generate `padding-left`/`padding-right` (physical properties). Responsive variants (e.g. `sm:px-5`) are placed later in the generated stylesheet than non-responsive physical utilities (e.g. `pl-[90px]`), so the responsive `padding-inline` silently wins the cascade and overrides the physical `padding-left`.

**Rule:** Never layer `pl-*`/`pr-*` on top of `px-*` (or responsive `px-*` variants) on the same element. Instead, split into separate `pl-*` and `pr-*` when you need independent control over one side.

```tsx
// BAD — sm:px-5 overrides pl-[90px] in Tailwind v4
className = "px-3 sm:px-5 pl-[90px]";

// GOOD — no conflict, each side controlled independently
className = "pr-3 sm:pr-5 pl-[90px]";
```

The same applies to `py-*` vs `pt-*`/`pb-*`.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Upstream Merge: Migration Ordering

MarCode has its own database migrations that were added at specific IDs. When merging upstream changes that introduce NEW migrations, **never renumber existing MarCode migrations** — existing users already have them applied at their original IDs. The Effect SQL migrator tracks migrations by numeric ID in the `effect_sql_migrations` table; renumbering causes it to skip the new upstream tables (thinking those IDs are done) and attempt to re-create existing tables at the new IDs.

**Rules for future upstream merges:**

1. Keep MarCode migrations at their original IDs (019, 020, 022).
2. Slot upstream's new migrations **after** the highest existing ID (currently 026+).
3. If upstream adds migrations at IDs that MarCode already occupies, renumber the **upstream** ones to higher slots — never the MarCode ones.
4. If MarCode adds new migrations, use the next available ID after the highest.
5. After reordering, update `apps/server/src/persistence/Migrations.ts` (imports + `migrationEntries` array).
6. Always test with both a **fresh database** (all migrations run) and verify the sequence is correct for **existing users** (only new migrations run).

## Testing

### Regression Test Suite

MarCode maintains a comprehensive regression test suite to protect MarCode-exclusive features during upstream merges. Tests are organized in layers:

- **Pure function unit tests** (`quotedContext.test.ts`, `ansiToSpans.test.tsx`, `jiraContext.test.ts`, `turnNotification.test.ts`, `themes/themes.test.ts`, `contracts/model.test.ts`) — deep coverage of exported logic.
- **Feature existence guards** (`featureGuards.test.ts` in both `apps/web/src/` and `apps/server/src/`) — read source files with `fs.readFileSync` and assert key patterns/exports are present. Catches features deleted during conflict resolution.
- **Work card guards** (`workCards.guard.test.ts`) — verify all rich tool display card components exist and export correctly.
- **Store guards** (`store.guard.test.ts`) — verify incremental event handlers and structural sharing logic exist in `store.ts`.
- **Browser tests** (`*.browser.tsx`) — rendered component tests using Playwright via Vitest browser mode.
- **Skeleton tests** (`Skeletons.browser.tsx`) — verify extracted skeleton components render correctly.

### Testing Policy

- **After every upstream merge:** run the full test suite (`bun run test` in each package) and verify all MarCode-exclusive features are preserved. Guard tests in `featureGuards.test.ts` and `workCards.guard.test.ts` will catch deleted/missing features immediately.
- **When implementing new MarCode-exclusive features:** create at least an existence/smoke guard test in the relevant `featureGuards.test.ts`, plus unit tests for any pure logic. Update `FEATURES.md` with the new feature entry.
- **When modifying existing features:** update or extend the corresponding tests. If changing exports, function signatures, or component structure — update the guard tests to match.
