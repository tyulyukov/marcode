const REQUIRED_ENV_VARS = ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Jira proxy will not function.`,
    );
  }
}
