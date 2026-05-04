import { assert, describe, it } from "@effect/vitest";

import { productAnalyticsRetryDelayMs } from "./AnalyticsService.ts";

describe("productAnalyticsRetryDelayMs", () => {
  it("backs product analytics retries off exponentially with a cap", () => {
    assert.equal(productAnalyticsRetryDelayMs(1), 30_000);
    assert.equal(productAnalyticsRetryDelayMs(2), 60_000);
    assert.equal(productAnalyticsRetryDelayMs(3), 120_000);
    assert.equal(productAnalyticsRetryDelayMs(20), 300_000);
  });
});
