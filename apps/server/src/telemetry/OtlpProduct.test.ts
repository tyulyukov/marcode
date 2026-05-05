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

  it("uses durationMs as the exported OTLP span duration", () => {
    const payload = makeProductSpanBatchPayload([
      {
        event: "marcode.tool.call",
        capturedAt: "2026-05-04T10:00:01.000Z",
        durationMs: 250,
        startedAt: "2026-05-04T10:00:00.000Z",
        attributes: {},
      },
    ]);

    const span = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];

    assert.equal(span?.startTimeUnixNano, "1777888800000000000");
    assert.equal(span?.endTimeUnixNano, "1777888800250000000");
  });

  it("exports span events on duration spans", () => {
    const payload = makeProductSpanBatchPayload([
      {
        event: "marcode.provider.turn",
        capturedAt: "2026-05-04T10:00:01.000Z",
        durationMs: 1_000,
        startedAt: "2026-05-04T10:00:00.000Z",
        attributes: {},
        spanEvents: [
          {
            name: "marcode.provider.turn.sent",
            at: "2026-05-04T10:00:00.000Z",
          },
          {
            name: "marcode.provider.turn.completed",
            at: "2026-05-04T10:00:01.000Z",
            attributes: { outcome: "success" },
          },
        ],
      },
    ]);

    const events = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.events;

    assert.equal(events?.length, 2);
    assert.equal(events?.[0]?.name, "marcode.provider.turn.sent");
    assert.equal(events?.[1]?.name, "marcode.provider.turn.completed");
    assert.deepEqual(events?.[1]?.attributes, [
      { key: "outcome", value: { stringValue: "success" } },
    ]);
  });
});
