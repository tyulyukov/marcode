# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

MarCode is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

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

MarCode is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

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
