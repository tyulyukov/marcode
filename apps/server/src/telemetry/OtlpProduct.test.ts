import { assert, describe, it } from "@effect/vitest";

import { makeProductSpanBatchPayload } from "./OtlpProduct.ts";

describe("makeProductSpanBatchPayload", () => {
  it("packs multiple product analytics events into one OTLP trace request", () => {
    const payload = makeProductSpanBatchPayload([
      {
        event: "marcode.first",
        capturedAt: "2026-05-04T10:00:00.000Z",
        attributes: { alpha: "one" },
      },
      {
        event: "marcode.second",
        capturedAt: "2026-05-04T10:00:01.000Z",
        attributes: { beta: 2 },
      },
    ]);

    assert.equal(payload.resourceSpans.length, 2);
    assert.equal(payload.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.name, "marcode.first");
    assert.equal(payload.resourceSpans[1]?.scopeSpans[0]?.spans[0]?.name, "marcode.second");
  });
});
