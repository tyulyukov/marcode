# MarCode Project Guidelines

## GitHub Repository

- **Origin**: `tyulyukov/marcode` (this is the main repo for CI checks)
- **Upstream**: `pingdotgg/t3code` (the fork source — do NOT check CI here)
- When checking CI status, always use `--repo tyulyukov/marcode` with `gh` commands.

## Rebrand Note

This project was forked from T3 Code and fully rebranded to MarCode. When merging upstream changes, always check for and replace any remaining T3 references, and **reject reintroduction of JS virtualization in `MessagesTimeline.tsx`** (see "Timeline rendering" section under Performance):

- Package imports: `@marcode/contracts`, `@marcode/shared/*` (never `@t3tools`)
- Env vars: `MARCODE_` prefix (never `T3CODE_`)
- Branch prefixes in tests: `marcode/` (never `t3code/`)
- Test file prefixes: `marcode-` (never `t3-`)
- User-facing strings: "MarCode" (never "T3 Code")
- Monorepo name in `bun.lock`/`package.json`: `@marcode/monorepo`

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
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

### Incremental domain event application (`__root.tsx`, `store.ts`)

High-frequency events (`thread.message-sent`, `thread.activity-appended`, `thread.session-set`, `thread.turn-diff-completed`, `thread.proposed-plan-upserted`) are applied **incrementally** to the Zustand store from event payloads — no full snapshot fetch. This avoids blocking the main thread with JSON parsing and object reconstruction during active agent work.

Full snapshot sync (`getSnapshot()`) only runs for:

- Non-incremental events (thread created/deleted/archived, etc.) via `nonIncrementalThrottler` (500ms)
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

**CRITICAL — DO NOT REINTRODUCE `@tanstack/react-virtual` or any JS virtualizer for the messages timeline.** This has been deliberately removed twice. Upstream (T3 Code) uses `useVirtualizer` with absolute positioning + `transform: translateY()`, but it causes persistent message overlap and scroll lag in MarCode because:

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

## Custom Theme System

MarCode supports 24+ themes across 12 families (MarCode branded, Catppuccin, Solarized, Dracula, Nord, One Dark, GitHub, Gruvbox, Tokyo Night, Rosé Pine, Ayu, Monokai). The default "System" preference uses branded MarCode Light/Dark based on OS preference.

### Architecture

- **Theme definitions** live in `apps/web/src/themes/definitions/` — one file per family, each exporting a `readonly ThemeDefinition[]`.
- **Registry** (`apps/web/src/themes/registry.ts`) — `THEME_REGISTRY` array, `THEME_MAP` for O(1) lookup, `THEME_GROUPS` for UI grouping.
- **Application** (`apps/web/src/themes/apply.ts`) — `applyThemeToDOM()` sets CSS variables via `document.documentElement.style` inline overrides (highest specificity). MarCode branded themes (`variables: null`) use the existing CSS cascade in `index.css` untouched.
- **Hook** (`apps/web/src/hooks/useTheme.ts`) — `useTheme()` returns `{ theme, activeTheme, resolvedTheme, setTheme }`. `resolvedTheme` is always `"light" | "dark"` derived from `ThemeDefinition.base`.
- **UI** (`apps/web/src/components/settings/ThemePicker.tsx`) — Grouped `Select` dropdown in Settings > General.

### Key Patterns

- `.dark` class on `<html>` is toggled based on `ThemeDefinition.base` — all `dark:` Tailwind utilities continue working.
- Custom theme CSS vars are set as inline styles on `document.documentElement`; cleared when switching back to branded themes.
- `resolvedTheme` ("light"|"dark") is used by diff rendering, code highlighting, and ~12 consumer components — none need changes when adding themes.
- localStorage migration: old `"light"` → `"marcode-light"`, `"dark"` → `"marcode-dark"`, handled transparently in `getStored()`.

### Adding New Themes

1. Create a new file in `apps/web/src/themes/definitions/` exporting a `ThemeDefinition[]`.
2. Add the `ThemeGroup` value to the union in `apps/web/src/themes/types.ts`.
3. Import and spread into `THEME_REGISTRY` in `apps/web/src/themes/registry.ts`.
4. Add the group entry to `THEME_GROUPS` in the same file.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Additional Directories (Thread Context)

Directories can be added to agent context at the thread level via a toolbar popover (`DirectoryPickerPopover`). They persist as `additionalDirectories` on `OrchestrationThread` metadata (survive server restart).

### Architecture

- **Server**: `additionalDirectories` is a field on `OrchestrationThread` schema (`packages/contracts/src/orchestration.ts`), persisted via `thread.meta.update` / `thread.meta-updated` events. The `ProviderCommandReactor` reads directories from the thread read model (not in-memory state) and triggers session restart when directories change.
- **Web**: `DirectoryPickerPopover` (`apps/web/src/components/chat/DirectoryPickerPopover.tsx`) renders in the composer footer toolbar. On add/remove it dispatches `thread.meta.update` with the merged `additionalDirectories` array. The `Thread` type in `types.ts` has `additionalDirectories: string[]`.
- **Persistence**: SQLite column `additional_directories_json` on projection threads table (migration 020).

### Key Patterns

- Directories are **thread-level persistent context**, NOT per-message inline chips. There is no inline placeholder or draft store infrastructure for directories.
- The popover reuses `projectBrowseDirectoriesQueryOptions` for search.
- Session restart comparison uses `threadSessionStartDirectories` Map to track what directories the last session was started with.

## Jira Integration

MarCode supports read-only Jira Cloud integration via OAuth 2.0 (3LO) with PKCE.

### Architecture

- `apps/server/src/jira/` — Server-side Jira services following Effect Service/Layer pattern
  - `Services/JiraTokenService.ts` — Token persistence, refresh, encryption (encrypted at rest in `{stateDir}/jira-tokens.json`)
  - `Services/JiraApiClient.ts` — Atlassian REST API wrapper for boards, sprints, issues, attachments
  - `Layers/` — Effect Layer implementations
  - `oauthRoutes.ts` — HTTP GET `/api/jira/auth` + `/api/jira/callback` for OAuth flow
  - `crypto.ts` — AES-256-GCM encryption for token storage
- `packages/contracts/src/jira.ts` — Shared schemas (JiraIssue, JiraBoard, JiraSprint, etc.)
- `apps/web/src/lib/jiraContext.ts` — Context formatting, URL parsing, `<jira_context>` XML blocks
- `apps/web/src/lib/jiraReactQuery.ts` — React Query options for all Jira endpoints

### Configuration

Jira integration requires OAuth 2.0 credentials from Atlassian. Set these environment variables to enable Jira:

- `MARCODE_JIRA_CLIENT_ID` — Atlassian OAuth app client ID (required to enable Jira)
- `MARCODE_JIRA_CLIENT_SECRET` — OAuth app client secret (required for token exchange)
- `MARCODE_JIRA_REDIRECT_URI` — OAuth redirect URI (defaults to `http://localhost:{port}/api/jira/callback` if not set)

**Setup Steps:**

1. Create an OAuth app at [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Configure the app with:
   - Redirect URL: `http://localhost:PORT/api/jira/callback` (for development) or your production domain
   - Scopes: `read:jira-work`, `read:jira-user`, `read:account` (read-only access)
3. Copy the Client ID and Client Secret and set them as environment variables
4. In the released desktop app, set environment variables via:
   - **macOS/Linux:** Set in shell profile (`.zshrc`, `.bashrc`) before launching the app
   - **Windows:** Set via System Properties > Environment Variables
   - **Or:** Create a `.env` file in the MarCode state directory (`~/.marcode/.env` on Unix, `%APPDATA%\marcode\.env` on Windows)

Board selection stored per project via `jiraBoard` field on `OrchestrationProject`

### Composer Integration

- `@PROJ-123` mention autocomplete (triggers when `@` query matches `/^[A-Z]{2,}-\d*/i`)
- `/jira` slash command for browsing sprint tasks
- Pasted Jira URL auto-detection (`*.atlassian.net/browse/PROJ-123`)
- Jira task context appended as `<jira_context>` XML blocks (same pattern as `<terminal_context>`)
- Text attachments included inline, images as `ChatImageAttachment`, binaries as metadata

### UI Components

- `JiraTaskInlineChip` — Visual chip for Jira tasks in the composer (parallel to `TerminalContextInlineChip`)
- `ComposerJiraTaskNode` — Lexical `DecoratorNode` for inline Jira task chips in the editor
- `UserMessageJiraContextLabel` — Expandable Jira context label rendered in the message timeline
- `JiraSettingsSection` — Settings panel component for Jira connection + board selection
- Settings page includes "Integrations" section between "General" and "Providers"

### Key Patterns

- `JiraTaskDraft` in composer draft store follows the `TerminalContextDraft` pattern
- `INLINE_JIRA_CONTEXT_PLACEHOLDER` (`\uFFFD`) for Lexical cursor math (like `\uFFFC` for terminal)
- `ComposerPromptSegment` union includes `"jira-context"` type alongside `"terminal-context"`
- `ComposerCommandItem` union includes `"jira-task"` type for menu autocomplete
- `Project` type in `types.ts` includes `jiraBoard: JiraBoardReference | null`

## Reply to Selection (Quoted Context)

MarCode supports replying to specific text selections within assistant messages. Users can select text in an agent response, click "Reply" in a floating toolbar, and the selected text is quoted as structured context in the composer.

### Architecture

- **`apps/web/src/lib/quotedContext.ts`** — `QuotedContext` type, prompt assembly (`appendQuotedContextsToPrompt`), extraction (`extractLeadingQuotedContexts`), dedup, truncation (5000 char limit).
- **`apps/web/src/components/chat/SelectionReplyToolbar.tsx`** — Floating toolbar that appears on text selection within assistant messages. Renders via `createPortal` to `document.body`. Detects code block selections and extracts language.
- **`apps/web/src/components/chat/QuotedContextInlineChip.tsx`** — Visual chip rendered in the composer above the editor showing quoted text preview with remove button. Uses violet color scheme.
- **`apps/web/src/components/chat/UserMessageQuotedContextLabel.tsx`** — Expandable label in the message timeline showing quoted context when a sent message includes it.
- **`apps/web/src/components/chat/MessagesTimeline.tsx`** — `AssistantMessageContentWithReply` wraps assistant message content with a ref for selection tracking and renders `SelectionReplyToolbar`.

### Key Patterns

- `QuotedContext` is stored in `composerDraftStore` as `quotedContexts: QuotedContext[]` on `ComposerThreadDraftState`.
- Quoted context blocks are **prepended** to the prompt (unlike terminal/jira which are appended) as `<quoted_context message_id="..." language="...">` XML blocks.
- `extractLeadingQuotedContexts()` parses leading quoted blocks from stored message text for timeline display.
- Keyboard shortcut: `Cmd/Ctrl+Shift+R` to reply to current selection, `Escape` to dismiss toolbar.
- Quoted contexts are **not** persisted to localStorage (transient draft state) — they are cleared on thread switch or send.
- Selection spanning multiple messages captures only text from the message where selection started.
- Truncation at 5000 chars with `...[truncated]` suffix.
