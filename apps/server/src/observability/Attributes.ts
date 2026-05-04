import { Cause, Exit } from "effect";

export type MetricAttributeValue = string;
export type MetricAttributes = Readonly<Record<string, MetricAttributeValue>>;
export type TraceAttributes = Readonly<Record<string, unknown>>;
export type ObservabilityOutcome = "success" | "failure" | "interrupt";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markSeen(value: object, seen: WeakSet<object>): boolean {
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);
  return false;
}

function normalizeJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (Array.isArray(value)) {
    if (markSeen(value, seen)) {
      return "[Circular]";
    }
    return value.map((entry) => normalizeJsonValue(entry, seen));
  }
  if (value instanceof Map) {
    if (markSeen(value, seen)) {
      return "[Circular]";
    }
    return Object.fromEntries(
      Array.from(value.entries(), ([key, entryValue]) => [
        String(key),
        normalizeJsonValue(entryValue, seen),
      ]),
    );
  }
  if (value instanceof Set) {
    if (markSeen(value, seen)) {
      return "[Circular]";
    }
    return Array.from(value.values(), (entry) => normalizeJsonValue(entry, seen));
  }
  if (!isPlainObject(value)) {
    return String(value);
  }
  if (markSeen(value, seen)) {
    return "[Circular]";
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, normalizeJsonValue(entryValue, seen)]),
  );
}

export function compactTraceAttributes(
  attributes: Readonly<Record<string, unknown>>,
): TraceAttributes {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeJsonValue(value)]),
  );
}

export function compactMetricAttributes(
  attributes: Readonly<Record<string, unknown>>,
): MetricAttributes {
  return Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      if (value === undefined || value === null) {
        return [];
      }
      if (typeof value === "string") {
        return [[key, value]];
      }
      if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return [[key, String(value)]];
      }
      return [];
    }),
  );
}

export function outcomeFromExit(exit: Exit.Exit<unknown, unknown>): ObservabilityOutcome {
  if (Exit.isSuccess(exit)) {
    return "success";
  }
  return Cause.hasInterruptsOnly(exit.cause) ? "interrupt" : "failure";
}

export function normalizeModelMetricLabel(model: string | null | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("gpt")) {
    return "gpt";
  }
  if (normalized.includes("claude")) {
    return "claude";
  }
  if (normalized.includes("gemini")) {
    return "gemini";
  }
  return "other";
}

/**
 * OTEL_DENY_SUFFIXES - attribute key suffixes that must never leave the process.
 *
 * Matched against the trailing dot-separated segment of an attribute key OR the
 * whole key. Example: `vcs.pr.url` -> trailing segment `url` -> denied.
 *
 * Intentionally suffix-based so newly-introduced keys inherit the deny by default
 * (e.g. `provider.tool.path` would be denied because of `path`).
 */
export const OTEL_DENY_SUFFIXES: ReadonlyArray<string> = [
  "cwd",
  "path",
  "file_path",
  "filename",
  "directory",
  "command_line",
  "argv",
  "cmdline",
  "body",
  "content",
  "text",
  "message_text",
  "prompt",
  "completion",
  "diff",
  "patch",
  "email",
  "username",
  "account_id",
  "url",
  "token",
  "secret",
  "key",
  "password",
  "authorization",
  "title",
  "summary",
  "description",
];

export function isDeniedAttributeKey(
  key: string,
  deny: ReadonlyArray<string> = OTEL_DENY_SUFFIXES,
): boolean {
  for (const suffix of deny) {
    if (key === suffix || key.endsWith(`.${suffix}`)) {
      return true;
    }
  }
  return false;
}

/**
 * sanitizeAttributes - drops attribute entries whose key matches OTEL_DENY_SUFFIXES.
 *
 * Used as a defense-in-depth filter at every span-event emission site so future
 * additions do not silently leak sensitive data into traces.
 */
export function sanitizeAttributes(
  attributes: Readonly<Record<string, unknown>>,
  deny: ReadonlyArray<string> = OTEL_DENY_SUFFIXES,
): TraceAttributes {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    if (isDeniedAttributeKey(key, deny)) {
      continue;
    }
    filtered[key] = normalizeJsonValue(value);
  }
  return filtered;
}
