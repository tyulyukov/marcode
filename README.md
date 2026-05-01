# MarCode

**One window for every AI coding agent. Wired into Jira, Git, and your team's workflow.**

MarCode is a desktop-grade GUI that puts Claude Code, Codex, OpenCode, and Cursor under a single, consistent surface — with first-class Jira context, GitHub & GitLab automation, remote control, and a tool-call display that actually makes agent runs readable.

## The enterprise workflow

The whole point: your engineers stay in **one app** from ticket to merge request.

1. **Drop in a Jira ticket.** `@PROJ-123` in the composer pulls the title, description, attachments, and links straight into context. Paste an `*.atlassian.net/browse/...` URL and MarCode auto-detects it. Browse boards and sprints with `/jira` without ever leaving the chat.
2. **Pick how you want to work.** Run the agent **in-place** against your local checkout, or one-click into an **isolated git worktree** so the agent can refactor without ever touching your working tree. Switch between threads, branches, and worktrees from the sidebar.
3. **Watch every step in plain English.** File reads, shell commands, web searches, MCP tool calls, and subagent task groups all render as purpose-built cards — not raw JSON. Approve, reject, or revert any checkpoint with one click.
4. **Ship with one click.** When the work is good, MarCode handles the rest of the chore work for you: it generates a semantic branch name (`feature/PROJ-123-…`), writes a clean commit message that reads naturally, opens a **PR on GitHub** or an **MR on GitLab** — auto-detected from your remote — with the Jira ticket key engraved in the title and the "why" lifted from the ticket description.

The Jira ticket key follows the work end-to-end: classified once on the first turn (so reference tickets don't leak), persisted on the thread, and visible on the chip beside the Commit / Push / MR button so reviewers always know what's being shipped.

## One GUI, every agent

| Provider        | Status       | CLI                                                        |
| --------------- | ------------ | ---------------------------------------------------------- |
| **Claude Code** | Default      | [`claude`](https://docs.anthropic.com/en/docs/claude-code) |
| **Codex**       | Stable       | [`codex`](https://github.com/openai/codex)                 |
| **OpenCode**    | Stable       | [`opencode`](https://opencode.ai)                          |
| **Cursor**      | Early Access | [`cursor-agent`](https://docs.cursor.com/en/cli/overview)  |

Pick a CLI, pick a model, switch mid-thread. Your agents share one history, one settings panel, and one set of keybindings.

## Why MarCode

- **Rich tool-call display.** Every shell command, file edit, web fetch, MCP call, and subagent spawn renders as a dedicated card with diffs, status, and inline previews — not a wall of JSON.
- **Native multi-host Git.** GitHub PRs and GitLab MRs from the same composer. The host is auto-detected from `remote.origin.url`; the UI relabels itself accordingly.
- **Jira-aware end-to-end.** OAuth 2.0 to Atlassian Cloud, sprint browsing, `@PROJ-123` mentions, and ticket-engraved branches / titles / MRs.
- **Remote control.** Run the server headless on a workstation or build box and connect from another desktop, phone, or tablet over your tailnet. See [REMOTE.md](./REMOTE.md).
- **Yours to customize.** 24+ themes across Catppuccin, Dracula, Nord, Tokyo Night, Rose Pine, Ayu, Solarized, GitHub, Gruvbox, One Dark, Monokai, and the branded MarCode set. Custom keybindings via [`~/.marcode/keybindings.json`](./KEYBINDINGS.md).
- **Fast under load.** Incremental event streaming, structural sharing in the store, and virtualized timelines keep the UI smooth through long agent runs.

A full inventory of fork-exclusive features lives in [FEATURES.md](./FEATURES.md).

## Installation

> [!NOTE]
> MarCode requires at least one coding-agent CLI installed and authenticated. Install whichever you use:
>
> - **Claude Code:** install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and run `claude`
> - **Codex:** install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - **OpenCode:** install [OpenCode](https://opencode.ai) (`npm i -g opencode-ai`) and authenticate
> - **Cursor (Early Access):** install [Cursor CLI](https://docs.cursor.com/en/cli/installation) and run `agent login`

For Git host integration:

- **GitHub PRs:** [`gh`](https://cli.github.com/) installed and authenticated
- **GitLab MRs:** [`glab`](https://gitlab.com/gitlab-org/cli) installed and authenticated (Personal Access Token works for self-hosted GitLab)

### Desktop app

Install the latest release from [GitHub Releases](https://github.com/tyulyukov/marcode/releases).
