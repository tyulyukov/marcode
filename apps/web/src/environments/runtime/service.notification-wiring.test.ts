import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE_SOURCE = readFileSync(resolve(__dirname, "service.ts"), "utf-8");

describe("notification wiring regression guard", () => {
  it("imports deriveTurnNotificationTriggers", () => {
    expect(SERVICE_SOURCE).toContain("deriveTurnNotificationTriggers");
  });

  it("imports dispatchTurnNotifications", () => {
    expect(SERVICE_SOURCE).toContain("dispatchTurnNotifications");
  });

  it("calls deriveTurnNotificationTriggers inside applyRecoveredEventBatch", () => {
    const fnBody = SERVICE_SOURCE.slice(
      SERVICE_SOURCE.indexOf("function applyRecoveredEventBatch"),
    );
    expect(fnBody).toContain("deriveTurnNotificationTriggers(");
  });

  it("calls dispatchTurnNotifications inside applyRecoveredEventBatch", () => {
    const fnBody = SERVICE_SOURCE.slice(
      SERVICE_SOURCE.indexOf("function applyRecoveredEventBatch"),
    );
    expect(fnBody).toContain("dispatchTurnNotifications(");
  });

  it("imports syncThreadActiveTurnFromSnapshot", () => {
    // Detail-subscription snapshot must arm the strict gate so a turn that
    // started before the subscription attached still fires its completion
    // notification. The deriver only looks at `threadsWithActiveTurn`, which
    // this function is the only safe (detail-stream-only) way to populate
    // outside of an in-process running event.
    expect(SERVICE_SOURCE).toContain("syncThreadActiveTurnFromSnapshot");
  });

  it("calls syncThreadActiveTurnFromSnapshot in the snapshot subscription handler", () => {
    // Locate the subscribeThread callback and assert the snapshot branch arms
    // the gate. Without this, fresh app loads mid-Codex-turn would silently
    // skip the completion notification.
    const subscribeBlock = SERVICE_SOURCE.slice(SERVICE_SOURCE.indexOf("subscribeThread"));
    const snapshotBranch = subscribeBlock.slice(
      0,
      subscribeBlock.indexOf("applyEnvironmentThreadDetailEvent"),
    );
    expect(snapshotBranch).toContain("syncThreadActiveTurnFromSnapshot(");
  });
});
