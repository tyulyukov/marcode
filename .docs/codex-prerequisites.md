# Provider prerequisites

MarCode requires at least one of the following coding agent CLIs installed and authorized:

## Claude Code CLI (default provider)

- Install [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) so `claude` is on your PATH.
- Authenticate before running MarCode.

## Codex CLI

- Install [Codex CLI](https://github.com/openai/codex) so `codex` is on your PATH.
- Authenticate Codex before running MarCode (for example via API key or ChatGPT auth supported by Codex).
- MarCode starts the server via `codex app-server` per Codex session.

## Git host CLIs (optional, for PR/MR features)

- **GitHub:** Install and authenticate [GitHub CLI (`gh`)](https://cli.github.com/).
- **GitLab:** Install and authenticate [GitLab CLI (`glab`)](https://gitlab.com/gitlab-org/cli). A Personal Access Token works for self-hosted instances.
