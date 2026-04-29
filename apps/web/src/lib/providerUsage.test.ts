import { describe, expect, it } from "vitest";
import { EventId, type OrchestrationThreadActivity, TurnId } from "@marcode/contracts";

import { deriveLatestProviderUsageSnapshot } from "./providerUsage";

function makeActivity(id: string, payload: unknown): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind: "account.rate-limits.updated",
    summary: "Account rate limits updated",
    payload,
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-03-23T00:00:00.000Z",
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

  it("marks current provider usage as rejected at 90 percent or higher", () => {
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

    expect(snapshot?.status).toBe("rejected");
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
});
