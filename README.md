# MarCode

MarCode is a web GUI for coding agents, built as a rebrand and major evolution of [T3 Code](https://github.com/t3dotgg/t3code). On top of the original foundation, MarCode brings performance optimizations, new integrations, and a refined experience:

- **Claude Code CLI** as the default and primary provider
- **Jira Cloud integration** (OAuth 2.0, sprint browsing, `@PROJ-123` mentions in composer)
- **GitLab support** alongside GitHub (auto-detected from remote origin)
- **Preview diff display** for proposed file changes
- **Incremental state updates** for smooth, non-blocking UI during agent work
- **Additional directories in composer** — add extra directories to agent context per thread
- And much more

## How to use

### Prerequisites

You need at least one of the following coding agent CLIs installed and authorized:

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex)

For git host integration:

- **PRs (GitHub):** [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated
- **MRs (GitLab):** [GitLab CLI (`glab`)](https://gitlab.com/gitlab-org/cli) installed and authenticated (Personal Access Token works for self-hosted instances)

### Via Desktop App

Install the [desktop app from the Releases page](https://github.com/tyulyukov/marcode/releases)
