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
});
