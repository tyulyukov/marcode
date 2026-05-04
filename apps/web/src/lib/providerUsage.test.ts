import { describe, expect, it } from "vitest";
import { EventId, type OrchestrationThreadActivity, TurnId } from "@marcode/contracts";

import { deriveLatestProviderUsageSnapshot } from "./providerUsage";

function makeActivity(
  id: string,
  payload: unknown,
  createdAt = "2026-03-23T00:00:00.000Z",
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind: "account.rate-limits.updated",
    summary: "Account rate limits updated",
    payload,
    turnId: TurnId.make("turn-1"),
    createdAt,
  };
}

describe("providerUsage", () => {
  it("derives Claude rate-limit windows from SDK events", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
          utilization: 0.83,
        },
      }),
    ]);

    expect(snapshot?.providerLabel).toBe("Claude");
    expect(snapshot?.status).toBe("warning");
    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: 83,
        resetsAt: 1776582000,
      },
    ]);
  });

  it("does not keep an old Claude warning after the same window resets", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
          utilization: 0.97,
        },
      }),
      makeActivity("activity-2", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          resetsAt: 1776600000,
          rateLimitType: "five_hour",
          utilization: 0,
        },
      }),
    ]);

    expect(snapshot?.providerLabel).toBe("Claude");
    expect(snapshot?.status).toBe("ok");
    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: 0,
        resetsAt: 1776600000,
      },
    ]);
  });

  it("keeps very high provider usage in warning until the limit is effectively exhausted", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
          utilization: 0.97,
        },
      }),
    ]);

    expect(snapshot?.status).toBe("warning");
  });

  it("uses Claude surpassedThreshold when utilization is omitted", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
          surpassedThreshold: 0.66,
        },
      }),
    ]);

    expect(snapshot?.status).toBe("ok");
    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: 66,
        resetsAt: 1776582000,
      },
    ]);
  });

  it("ignores allowed Claude events that omit any usage data", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
        },
      }),
    ]);

    expect(snapshot).toBeNull();
  });

  it("surfaces non-allowed Claude events even when utilization is omitted", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
        },
      }),
    ]);

    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: null,
        resetsAt: 1776582000,
      },
    ]);
  });

  it("returns null when every Claude event lacks usage data and is allowed", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          resetsAt: 1776582000,
          rateLimitType: "five_hour",
        },
      }),
      makeActivity("activity-2", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          resetsAt: 1776600000,
          rateLimitType: "seven_day",
        },
      }),
    ]);

    expect(snapshot).toBeNull();
  });

  it("derives Codex primary and secondary rate-limit windows", () => {
    const snapshot = deriveLatestProviderUsageSnapshot([
      makeActivity("activity-1", {
        rateLimits: {
          limitId: "codex",
          primary: {
            usedPercent: 12,
            windowDurationMins: 300,
            resetsAt: 1776587601,
          },
          secondary: {
            usedPercent: 44,
            windowDurationMins: 10080,
            resetsAt: 1777019601,
          },
        },
      }),
    ]);

    expect(snapshot?.providerLabel).toBe("Codex");
    expect(snapshot?.status).toBe("ok");
    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: 12,
        resetsAt: 1776587601,
      },
      {
        label: "Weekly",
        usedPercent: 44,
        resetsAt: 1777019601,
      },
    ]);
  });

  it("can derive Codex usage across mixed provider activity streams", () => {
    const snapshot = deriveLatestProviderUsageSnapshot(
      [
        makeActivity(
          "activity-1",
          {
            rateLimits: {
              limitId: "codex",
              primary: {
                usedPercent: 12,
                windowDurationMins: 300,
                resetsAt: 1776587601,
              },
            },
          },
          "2026-03-23T00:00:00.000Z",
        ),
        makeActivity(
          "activity-2",
          {
            type: "rate_limit_event",
            rate_limit_info: {
              status: "allowed_warning",
              resetsAt: 1776600000,
              rateLimitType: "five_hour",
              utilization: 0.91,
            },
          },
          "2026-03-23T00:01:00.000Z",
        ),
      ],
      { provider: "codex" },
    );

    expect(snapshot?.providerLabel).toBe("Codex");
    expect(snapshot?.updatedAt).toBe("2026-03-23T00:00:00.000Z");
    expect(snapshot?.windows).toEqual([
      {
        label: "Session (5 hrs)",
        usedPercent: 12,
        resetsAt: 1776587601,
      },
    ]);
  });

  it("returns null when the requested provider has no usage events", () => {
    const snapshot = deriveLatestProviderUsageSnapshot(
      [
        makeActivity("activity-1", {
          rateLimits: {
            limitId: "codex",
            primary: {
              usedPercent: 12,
              windowDurationMins: 300,
              resetsAt: 1776587601,
            },
          },
        }),
      ],
      { provider: "claudeAgent" },
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for cursor provider even when Claude/Codex events are present", () => {
    const snapshot = deriveLatestProviderUsageSnapshot(
      [
        makeActivity("activity-1", {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            resetsAt: 1776582000,
            rateLimitType: "five_hour",
            utilization: 0.83,
          },
        }),
        makeActivity("activity-2", {
          rateLimits: {
            limitId: "codex",
            primary: {
              usedPercent: 12,
              windowDurationMins: 300,
              resetsAt: 1776587601,
            },
          },
        }),
      ],
      { provider: "cursor" },
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for opencode provider even when Claude/Codex events are present", () => {
    const snapshot = deriveLatestProviderUsageSnapshot(
      [
        makeActivity("activity-1", {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            resetsAt: 1776582000,
            rateLimitType: "five_hour",
            utilization: 0.83,
          },
        }),
        makeActivity("activity-2", {
          rateLimits: {
            limitId: "codex",
            primary: {
              usedPercent: 12,
              windowDurationMins: 300,
              resetsAt: 1776587601,
            },
          },
        }),
      ],
      { provider: "opencode" },
    );

    expect(snapshot).toBeNull();
  });
});
