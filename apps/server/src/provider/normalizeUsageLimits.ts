import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@marcode/contracts";

function clampUsedPercentage(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseResetsAt(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "number" && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function inferWindowKind(
  key: string,
  durationMins: number | null,
): "session" | "weekly" | undefined {
  if (durationMins === 300) return "session";
  if (durationMins === 10_080) return "weekly";

  const lower = key.toLowerCase();
  if (lower.includes("session") || lower === "primary" || lower.includes("five_hour")) {
    return "session";
  }
  if (
    lower.includes("week") ||
    lower === "secondary" ||
    lower.includes("seven") ||
    lower.includes("seven_day")
  ) {
    return "weekly";
  }
  return undefined;
}

function buildWindow(
  kind: "session" | "weekly",
  usedPercentage: number,
  resetsAt: string,
  windowDurationMins: number | null,
): ServerProviderUsageWindow {
  return {
    kind,
    label: kind === "session" ? "Session limit" : "Weekly limit",
    usedPercentage: clampUsedPercentage(usedPercentage),
    resetsAt,
    windowDurationMins,
  } as ServerProviderUsageWindow;
}

function normalizeCodexRateLimitEntry(
  key: string,
  entry: Record<string, unknown>,
): ServerProviderUsageWindow | undefined {
  const usedPercent = entry.usedPercent ?? entry.used_percent ?? entry.usedPercentage;
  if (usedPercent === undefined && usedPercent !== 0) return undefined;

  const resetTimestamp = entry.resetTimestamp ?? entry.reset_timestamp ?? entry.resetsAt;
  const resetsAt = parseResetsAt(resetTimestamp);
  if (!resetsAt) return undefined;

  const durationMins = asNumber(entry.windowDurationMins ?? entry.window_duration_mins) ?? null;
  const kind = inferWindowKind(key, durationMins);
  if (!kind) return undefined;

  return buildWindow(kind, clampUsedPercentage(usedPercent), resetsAt, durationMins);
}

export function normalizeCodexUsageLimits(
  rawRateLimits: unknown,
  createdAt: string,
): ServerProviderUsageLimits | undefined {
  const record = asRecord(rawRateLimits);
  if (!record) return undefined;

  const codexScoped = asRecord(asRecord(record.rateLimitsByLimitId)?.codex);
  const source = codexScoped ?? record;

  const windows: ServerProviderUsageWindow[] = [];

  const primary = asRecord(source.primary);
  if (primary) {
    const window = normalizeCodexRateLimitEntry("primary", primary);
    if (window) windows.push(window);
  }

  const secondary = asRecord(source.secondary);
  if (secondary) {
    const window = normalizeCodexRateLimitEntry("secondary", secondary);
    if (window) windows.push(window);
  }

  if (windows.length === 0) {
    for (const [key, value] of Object.entries(source)) {
      if (key === "rateLimitsByLimitId") continue;
      const entry = asRecord(value);
      if (!entry) continue;
      const window = normalizeCodexRateLimitEntry(key, entry);
      if (window) windows.push(window);
    }
  }

  if (windows.length === 0) return undefined;

  return {
    windows,
    updatedAt: createdAt,
  };
}

export function normalizeClaudeUsageLimits(
  rawRateLimits: unknown,
  createdAt: string,
): ServerProviderUsageLimits | undefined {
  const record = asRecord(rawRateLimits);
  if (!record) return undefined;

  const rateLimits = asRecord(record.rate_limits) ?? asRecord(record.rateLimits) ?? record;

  const windows: ServerProviderUsageWindow[] = [];

  const fiveHour = asRecord(rateLimits.five_hour) ?? asRecord(rateLimits.fiveHour);
  if (fiveHour) {
    const usedPct = fiveHour.used_percentage ?? fiveHour.usedPercentage ?? fiveHour.usedPercent;
    const resetRaw = fiveHour.resets_at ?? fiveHour.resetsAt ?? fiveHour.resetTimestamp;
    const resetsAt = parseResetsAt(resetRaw);
    if (usedPct !== undefined && resetsAt) {
      windows.push(buildWindow("session", clampUsedPercentage(usedPct), resetsAt, 300));
    }
  }

  const sevenDay = asRecord(rateLimits.seven_day) ?? asRecord(rateLimits.sevenDay);
  if (sevenDay) {
    const usedPct = sevenDay.used_percentage ?? sevenDay.usedPercentage ?? sevenDay.usedPercent;
    const resetRaw = sevenDay.resets_at ?? sevenDay.resetsAt ?? sevenDay.resetTimestamp;
    const resetsAt = parseResetsAt(resetRaw);
    if (usedPct !== undefined && resetsAt) {
      windows.push(buildWindow("weekly", clampUsedPercentage(usedPct), resetsAt, 10_080));
    }
  }

  if (windows.length === 0) return undefined;

  return {
    windows,
    updatedAt: createdAt,
  };
}
