# MarCode Exclusive Features

Features implemented exclusively in MarCode that do **not** exist upstream. This document serves as a safeguard during upstream merges — every feature listed here **must be preserved**.

---

## Table of Contents

- [Performance & Architecture](#performance--architecture)
- [Chat UI Enhancements](#chat-ui-enhancements)
- [Rich Tool Display Cards](#rich-tool-display-cards)
- [Git Integration (Multi-Host)](#git-integration-multi-host)
- [Jira Cloud Integration](#jira-cloud-integration)
- [Jira Ticket Engraving in Branches / Commits / MRs](#jira-ticket-engraving-in-branches--commits--mrs)
- [Theme System](#theme-system)
- [Notifications](#notifications)
- [Composer Enhancements](#composer-enhancements)
- [Timeline & Work Log](#timeline--work-log)
- [Desktop App](#desktop-app)
- [Landing Page](#landing-page)
- [Branding & Telemetry](#branding--telemetry)

---

### Incremental Event Handling & Structural Sharing

**Commit:** `a57deb04` (described as "HUGE OPTIMIZATION WIN")
**Files:** `apps/web/src/store.ts`, `apps/web/src/routes/__root.tsx`

High-frequency events (`thread.message-sent`, `thread.activity-appended`, `thread.session-set`, `thread.turn-diff-completed`, `thread.proposed-plan-upserted`) are applied **incrementally** to the Zustand store from event payloads — no full snapshot fetch. `syncServerReadModel` uses structural sharing: each thread/project is compared field-by-field; unchanged objects retain the **same reference** to prevent Zustand re-renders.

## Chat UI Enhancements

### Selection Reply / Quoted Context

**Commits:** `d9a58cf8`, `5876e166`, `8d0ed76e`, `036156a0`
**Files:**

- `apps/web/src/components/chat/SelectionReplyToolbar.tsx`
- `apps/web/src/components/chat/QuotedContextInlineChip.tsx`
- `apps/web/src/components/chat/UserMessageQuotedContextLabel.tsx`
- `apps/web/src/lib/quotedContext.ts`

Users select text in assistant messages, click "Reply" in a floating toolbar, and the selection is quoted as `<quoted_context>` XML blocks prepended to the prompt. Supports code block language detection, diff-reply from diff panel, and `Cmd/Ctrl+Shift+R` hotkey.

### Inline User Message Editing

**Commit:** `46ea9a74`
**Files:** `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`

Users can edit previously sent messages inline in the timeline.

### Text Reveal Animation

**Commits:** `9201b7a5`, `be907b7f`
**Files:** `apps/web/src/components/chat/MessagesTimeline.tsx`

Smooth text reveal animation on assistant message completion with database indexes for performance.

### Inline Diff Previews in Work Log

**Commits:** `b3e76d5c`, `c6ddd383`
**Files:** `apps/web/src/components/chat/MessagesTimeline.tsx`

Syntax-highlighted inline diff previews with context-aware trimming directly in the work log timeline.

### Copy Button on Assistant & Proposed Plan Messages

**Commits:** `b44ceada`, `fae360b7`
**Files:** `apps/web/src/components/chat/MessagesTimeline.tsx`

> **Note:** Upstream also implemented a copy button (`26cc1fff`) with anchored toast feedback. During merge, compare both implementations and keep the better UX.

---

## Rich Tool Display Cards

**Commits:** `41acc846`, `8da9e581`, `bce28700`, `e54a450d`, `7f1dc85`
**Files:** `apps/web/src/components/chat/work-cards/`

Unified card-based UI system for various tool outputs:

| Card Component             | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `WebSearchCard.tsx`        | Web search results with status indicators |
| `WebFetchCard.tsx`         | Web fetch operations                      |
| `ExplorationCard.tsx`      | File reads and codebase searches          |
| `CommandExecutionCard.tsx` | Terminal command output                   |
| `FileChangeCard.tsx`       | Git file changes with diff rendering      |
| `McpToolCallCard.tsx`      | MCP tool invocation results               |
| `ProposedPlanCard.tsx`     | AI-proposed action plans                  |
| `AgentGroupCard.tsx`       | Sub-agent task orchestration              |
| `ChangedFilesTree.tsx`     | Hierarchical file tree display            |

Subagent task detail drawer with activity timeline (`bce28700`).

---

## Git Integration (Multi-Host)

### GitLab Merge Request Support

**Commits:** `6f53ffce`, `8c3bcafa`, `dded5d90`, `55b3fffc`
**Files:**

- `apps/server/src/git/Services/GitHostCli.ts` — abstract interface
- `apps/server/src/git/Layers/GitHubCli.ts` — `gh` CLI wrapper
- `apps/server/src/git/Layers/GitLabCli.ts` — `glab` CLI wrapper
- `apps/server/src/git/Layers/RoutingGitHostCli.ts` — auto-detection router

Provider-agnostic PR/MR operations. `RoutingGitHostCli` auto-detects GitHub vs GitLab from `remote.origin.url`, with fallback to `git config marcode.gitHostProvider`. The web UI dynamically shows "PR" or "MR" labels based on `gitHostProvider` from `GitStatusResult`.

### Claude-Powered Text Generation

**Files:**

- `apps/server/src/git/Layers/ClaudeTextGeneration.ts`
- `apps/server/src/git/Layers/RoutingTextGeneration.ts`

Progressive text generation for semantic commit messages and PR content using Claude API, with Codex fallback.

### Additional Git Features

- Working tree diff viewing (`9aa6cb2b`)
- Repo flag support for PR commands (`f613202`)
- Handle missing worktree directories gracefully (`54e6ddc2`)
- Improved git text generation prompt robustness (`671a07a2`)

---

## Jira Cloud Integration

**Commits:** `325e81b7`, `af75a887`, `c6fd1eba`, `ac974e55`, `3a7eeacb`
**Files:**

- `apps/server/src/jira/` — Full server-side implementation
  - `Services/JiraTokenService.ts` — Token persistence, refresh, AES-256-GCM encryption
  - `Services/JiraApiClient.ts` — Atlassian REST API (boards, sprints, issues, attachments)
  - `oauthRoutes.ts` — OAuth 2.0 (3LO) with PKCE flow
  - `crypto.ts` — Encryption utilities
- `packages/contracts/src/jira.ts` — Shared schemas
- `apps/web/src/lib/jiraContext.ts` — Context formatting, URL parsing
- `apps/web/src/lib/jiraReactQuery.ts` — React Query options
- `apps/web/src/components/chat/JiraTaskInlineChip.tsx` — Composer chip
- `apps/web/src/components/settings/JiraSettingsSection.tsx` — Settings panel
- `apps/desktop/src/main.ts` — Build-time embedded env var injection into server child process
- `apps/desktop/tsdown.config.ts` — `__EMBEDDED_MARCODE_JIRA_*__` defines baked at build time

### Desktop Env Var Wiring (Critical)

`tsdown.config.ts` embeds `MARCODE_JIRA_REDIRECT_URI` and `MARCODE_JIRA_TOKEN_PROXY_URL` at build time via `define`. `main.ts` must declare them (`declare const __EMBEDDED_MARCODE_JIRA_*__`) and inject them into the server child process env in `backendChildEnv()`. Without this, the server never receives the values and OAuth fails with "MARCODE_JIRA_TOKEN_PROXY_URL is not configured".

When merging upstream, **reject** any removal of:

- `declare const __EMBEDDED_MARCODE_JIRA_REDIRECT_URI__` / `__EMBEDDED_MARCODE_JIRA_TOKEN_PROXY_URL__` in `main.ts`
- The `embeddedJiraDefaults` loop in `backendChildEnv()`

### Composer Integration

- `@PROJ-123` mention autocomplete
- `/jira` slash command for sprint browsing
- Pasted Jira URL auto-detection (`*.atlassian.net/browse/PROJ-123`)
- Jira task context appended as `<jira_context>` XML blocks
- Text attachments inline, images as `ChatImageAttachment`

---

## Jira Ticket Engraving in Branches / Commits / MRs

**Files:**

- `apps/server/src/git/Prompts.ts` — `buildClassifyImplementingJiraTicketsPrompt`, `COMMIT_JIRA_CONTEXT_RULE`, `PR_TITLE_REQUIRED_RULE`, `PR_BODY_RULE`, `BRANCH_RULE`, etc.
- `apps/server/src/git/Services/TextGeneration.ts` — `classifyImplementingJiraTickets` method on `TextGenerationShape`; `jiraTickets?` on commit/PR/branch/title generation inputs
- `apps/server/src/git/Layers/{Claude,Codex,Cursor,OpenCode}TextGeneration.ts` — `classifyImplementingJiraTickets` implementation per provider; `filterToAllowedKeys` hallucination guard
- `apps/server/src/git/Layers/RoutingTextGeneration.ts` — fallback routing for the classifier alongside the existing `withFallback` pattern
- `apps/server/src/git/Utils.ts` — `filterToAllowedKeys` utility
- `apps/server/src/git/Layers/GitManager.ts` — `runStackedAction` resolves `jiraTickets` once via `JiraContextCollector` and threads them into `runFeatureBranchStep` / `runCommitStep` / `runPrStep`
- `apps/server/src/jira/Services/JiraContextCollector.ts` + `Layers/JiraContextCollector.ts` — Effect service that walks `thread.messages`, extracts `<jira_context>` blocks, then **filters by `thread.implementingJiraTicketKeys`** so only classified tickets reach the auxiliary generators. Falls back to all mentions when classification hasn't run yet.
- `apps/server/src/jira/threadJiraContext.ts` — `collectThreadJiraContexts` with token budgets + dedup
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` — `maybeClassifyAndPersistImplementingJiraTickets` runs at first turn before branch-rename / title-gen, persists result via `thread.meta.update`
- `packages/shared/src/jiraContext.ts` — shared `JiraTaskDraft`, `JiraTicketContext`, `extractTrailingJiraContexts`, `parseJiraContextEntry`, `jiraIssueKeysFromContexts` (re-exported by `apps/web/src/lib/jiraContext.ts`)
- `packages/contracts/src/git.ts` — `threadId?: ThreadId` on `GitRunStackedActionInput`
- `packages/contracts/src/orchestration.ts` — `implementingJiraTicketKeys: Schema.Array(JiraIssueKey)` on `OrchestrationThread` + `OrchestrationThreadShell`; same field optional on `ThreadMetaUpdateCommand` / `ThreadMetaUpdatedPayload`
- `apps/server/src/orchestration/{decider,projector}.ts` + `Layers/{ProjectionPipeline,ProjectionSnapshotQuery}.ts` — projection plumbing for the new field
- `apps/server/src/persistence/Services/ProjectionThreads.ts` + `Layers/ProjectionThreads.ts` — `implementingJiraTicketKeys` row column + JSON encoding
- `apps/server/src/persistence/Migrations/031_ProjectionThreadsImplementingJiraTicketKeys.ts` + `Migrations.ts` — adds `implementing_jira_ticket_keys_json TEXT NOT NULL DEFAULT '[]'` to `projection_threads`
- `apps/web/src/types.ts`, `apps/web/src/store.ts` — `Thread.implementingJiraTicketKeys`, `ThreadShell.implementingJiraTicketKeys` mapped through projection + meta-update event reducer
- `apps/web/src/components/GitActionsJiraChips.tsx` — chip beside the git-actions group reads `thread.implementingJiraTicketKeys`; tooltip explains the classification semantics
- `apps/web/src/components/GitActionsControl.tsx` — passes `activeServerThread?.implementingJiraTicketKeys` to the chip; passes `activeThreadRef.threadId` on `runStackedAction` mutation
- `apps/web/src/lib/gitReactQuery.ts` — `gitRunStackedActionMutationOptions` accepts and forwards `threadId`

For enterprise users who live in Jira + GitLab/GitHub. The flow:

1. User `@jira:`-mentions tickets in any user message. Composer serializes them into a trailing `<jira_context>...</jira_context>` block per message (existing infra).
2. **First-turn classifier** runs on the server via the configured text-generation model. Input: the user's message text + every mentioned ticket. Output: the subset of ticket keys the user is **actively implementing** (vs. mentioned for context / reference / pattern-matching). Even a single mentioned ticket goes through the classifier — a lone reference ticket (e.g. "fix this the same way we fixed `@jira:OTHER-99`") must not leak into the branch/commit/PR.
3. Result is persisted as `thread.implementingJiraTicketKeys` via the existing `thread.meta-updated` event path. Survives reconnects, server restarts, and app reopens.
4. **Branch:** the worktree-rename produces `marcode/PROJECT-111-<short-name>` (or `marcode/PROJECT-111-PROJECT-222-<short-name>` for multi-ticket implementations). Commit-time feature-branch flow wraps to `feature/PROJECT-111-…`.
5. **Commit messages:** Jira tickets are passed to the prompt as **CONTEXT ONLY**. The model uses ticket descriptions to inform the body's "why" but is explicitly forbidden from including the ticket key in the subject or body — no `Refs:` trailer, no `[KEY]` prefix, no parenthesized suffix. Commit messages read naturally on their own.
6. **PR/MR titles:** the implemented ticket key is **mandatory and visible**. The model picks placement (bracketed prefix, parenthesized suffix, or interpolated scope) — non-negotiable that the key appears.
7. **PR/MR bodies:** Jira description informs `## Summary`'s "why". No `## Tickets` sidecar section, no `Refs:` trailer — the title already carries the key.
8. **UI chip** (`GitActionsJiraChips`) sits beside the Commit / Push / MR action button and shows the classified implementing keys (primary + `+N` for additional tickets, hover popover lists all). Reads from `thread.implementingJiraTicketKeys` directly — server is the source of truth, web is read-only feedback.

### Trust boundary (Critical)

The contract change is **only `threadId?: ThreadId`** on `GitRunStackedActionInput`. The client never ships ticket descriptions back to the server. The server re-derives Jira context from stored message text via `JiraContextCollector` and applies the classified-keys filter. Avoids prompt-injection vector and parser drift.

When merging upstream, **reject** any change that:

- Adds a `jiraTickets[]` payload field to `GitRunStackedActionInput`.
- Drops the `threadId` field or stops the web from passing it.
- Inlines Jira context parsing into web — keep it in `@marcode/shared/jiraContext` so server + web stay aligned.
- Removes the `withDecodingDefault([])` on `OrchestrationThread.implementingJiraTicketKeys` / `OrchestrationThreadShell.implementingJiraTicketKeys` (breaks decoding of pre-feature DB rows).
- Drops migration `031_ProjectionThreadsImplementingJiraTicketKeys` from `Migrations.ts`.

### Resilience

`JiraContextCollector` wraps the read pipeline in `Effect.catchCause` — any failure (read-model miss, parse error, OAuth-expired Jira upstream) degrades silently to `[]`. The classifier itself is wrapped the same way and falls back to `mentionedTickets` (no filtering) when classification fails. Commit/PR actions are never blocked by the Jira layer.

The classifier prompt defaults to **excluding** ambiguous tickets — better to omit a key from artifacts than engrave a reference ticket the user never intended to implement. The model output is filtered through `filterToAllowedKeys` so the model can't invent a key.

---

## Theme System

**Commit:** `4e52e0e9` (and `fc042b23`)
**Files:** `apps/web/src/themes/`

24+ themes across 12 families:

| Family                | Variants                        |
| --------------------- | ------------------------------- |
| **MarCode** (branded) | Light, Dark                     |
| Catppuccin            | Latte, Frappe, Macchiato, Mocha |
| Solarized             | Light, Dark                     |
| Dracula               | Dark                            |
| Nord                  | Dark                            |
| One Dark              | Dark                            |
| GitHub                | Light, Dark                     |
| Gruvbox               | Light, Dark                     |
| Tokyo Night           | Dark                            |
| Rose Pine             | Light, Dark, Moon               |
| Ayu                   | Light, Dark, Mirage             |
| Monokai               | Dark                            |

Architecture:

- `definitions/` — One file per family, each exporting `ThemeDefinition[]`
- `registry.ts` — `THEME_REGISTRY`, `THEME_MAP` (O(1) lookup), `THEME_GROUPS`
- `apply.ts` — `applyThemeToDOM()` sets CSS variables via inline overrides (highest specificity)
- `types.ts` — `ThemeDefinition`, `ThemeGroup` types
- `apps/web/src/hooks/useTheme.ts` — `useTheme()` hook
- `apps/web/src/components/settings/ThemePicker.tsx` — UI picker

---

## Notifications

### Turn Notifications

**Commits:** `3630a771`, `97a4ac08`, `63fd111f`

OS-level notifications with sound when agent turns complete. Per-event notification expand state separate from toggle. Suppresses completion notifications for user-initiated stops.

---

## Composer Enhancements

### Directory Picker Popover

**Commit:** `2f23e5a9`
**Files:** `apps/web/src/components/chat/DirectoryPickerPopover.tsx`

Thread-level additional directories via toolbar popover. Directories persist as `additionalDirectories` on `OrchestrationThread` metadata. Session restarts when directories change.

### Attachments Menu Consolidation

**Commit:** `ec3110ba`

Footer controls consolidated into a single attachments menu for cleaner UX.

---

## Timeline & Work Log

### Agent Task Groups

**Commit:** `d25491b2`

Display agent task groups in the timeline with a dedicated card and activity rendering.

### ANSI-to-Spans Utility

**Commit:** `3e4e1a2a`
**Files:** `apps/web/src/lib/ansiToSpans.ts`

Dedicated utility for converting ANSI escape sequences to styled spans for terminal output rendering in cards.

---

## Desktop App

### Fullscreen State Handling & Logo Adjustment

**Commits:** `404d618e`, `53b5f31a`, `a76e5882`
**Files:**

- `apps/desktop/src/main.ts` — `enter-full-screen` / `leave-full-screen` window listeners send `FULLSCREEN_STATE_CHANNEL` IPC to renderer
- `apps/desktop/src/preload.ts` — `onFullscreenChange` bridge method listens on `desktop:fullscreen-change`
- `apps/web/src/components/Sidebar.tsx` — `SidebarChromeHeader` subscribes via `desktopBridge.onFullscreenChange` and adjusts logo padding

macOS hides the native traffic light buttons (close/minimize/fullscreen) when entering fullscreen. The sidebar logo header adapts:

- **Non-fullscreen:** `paddingLeft: 58` offsets logo right to clear traffic light buttons, `justify-center` centers within remaining space
- **Fullscreen:** No padding override — logo is truly centered in the sidebar header

All three layers (main → preload → React) must stay in sync. The upstream merge can nuke any of them.

### Branding Assets

**Commit:** `5c0dacf9`

Custom MarCode icons across desktop and macOS platforms.

---

## Landing Page

**Commits:** `41841e23`, `be024f7c`, `374f0ca3`, `32add366`, `93c3739e`, `dc414df2`
**Files:** `apps/landing/`

Full marketing/download landing page:

- Docker containerization
- Dynamic versioning and OS-specific download assets
- Feature grid with "Rich Tool Display" section
- Installation guide
- Latest release integration
- Reusable bento-grid CSS layout

---

## Branding & Telemetry

### MarCode Rebrand

**Commit:** `5ad43ef9`

Complete rebrand to MarCode:

- Package imports: `@marcode/contracts`, `@marcode/shared`
- Env vars: `MARCODE_` prefix
- User-facing strings: "MarCode"
- Custom logos and icons

### Telemetry Removal

**Commits:** `8f5692cc`, `4748a090`

Complete removal of PostHog analytics and telemetry services. All analytics collection code deleted.

---

## Feature Checklist for Merge Verification

After any upstream merge, verify each feature still works:

- [ ] Incremental event handling + structural sharing
- [ ] Selection reply / quoted context (`Cmd+Shift+R`)
- [ ] Inline user message editing
- [ ] Text reveal animation
- [ ] Inline diff previews in work log
- [ ] All rich tool display cards
- [ ] GitLab MR support + dynamic PR/MR labels
- [ ] Jira OAuth + board selection + task chips
- [ ] Jira ticket engraving — first-turn classifier persists `implementingJiraTicketKeys`; branch/PR title carry the key; commit messages stay clean (no `Refs:` trailer, no `[KEY]` prefix); chip beside git-actions reads `thread.implementingJiraTicketKeys`; migration `031` adds the column; `@marcode/shared/jiraContext` hosts the shared parser
- [ ] All 24+ themes
- [ ] Turn notifications with sound
- [ ] Directory picker popover
- [ ] Agent task groups in timeline
- [ ] Fullscreen desktop handling
- [ ] Landing page
- [ ] MarCode branding (no upstream references)
- [ ] No telemetry/PostHog code
