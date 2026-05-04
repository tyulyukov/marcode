const REQUIRED_ENV_VARS = [
  "JIRA_CLIENT_ID",
  "JIRA_CLIENT_SECRET",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
] as const;

const OPTIONAL_ENV_VARS = ["OTEL_EXPORTER_OTLP_TRACES_HEADERS"] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Jira proxy and/or OTEL ingest will not function.`,
    );
  }
  for (const key of OPTIONAL_ENV_VARS) {
    if (!process.env[key]) {
      console.warn(
        `[validateEnv] ${key} is not set. OTEL ingest will forward to Tempo without auth headers.`,
      );
    }
  }
}
