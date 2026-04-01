import {
  readEnvironmentFromLoginShell,
  resolveLoginShell,
  ShellEnvironmentReader,
} from "@marcode/shared/shell";

const JIRA_ENV_VARS = ["MARCODE_JIRA_REDIRECT_URI", "MARCODE_JIRA_TOKEN_PROXY_URL"] as const;

export function syncShellEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    platform?: NodeJS.Platform;
    readEnvironment?: ShellEnvironmentReader;
  } = {},
): void {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux") return;

  try {
    const shell = resolveLoginShell(platform, env.SHELL);
    if (!shell) return;

    const shellEnvironment = (options.readEnvironment ?? readEnvironmentFromLoginShell)(shell, [
      "PATH",
      "SSH_AUTH_SOCK",
      ...JIRA_ENV_VARS,
    ]);

    if (shellEnvironment.PATH) {
      env.PATH = shellEnvironment.PATH;
    }

    if (!env.SSH_AUTH_SOCK && shellEnvironment.SSH_AUTH_SOCK) {
      env.SSH_AUTH_SOCK = shellEnvironment.SSH_AUTH_SOCK;
    }

    for (const name of JIRA_ENV_VARS) {
      if (!env[name] && shellEnvironment[name]) {
        env[name] = shellEnvironment[name];
      }
    }
  } catch {
    // Keep inherited environment if shell lookup fails.
  }
}
