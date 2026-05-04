import { Effect, Layer } from "effect";

import { recordSpanEvent } from "../../observability/SpanEvents.ts";
import { AnalyticsService } from "../Services/AnalyticsService.ts";

export const AnalyticsServiceNoopLive = Layer.succeed(AnalyticsService, {
  record: () => Effect.void,
  flush: Effect.void,
});

/**
 * AnalyticsServiceOtelLive - emits analytics events as OTEL span events on the
 * current span. `flush` is a no-op because the OTEL pipeline (Effect's
 * OtlpTracer) batches and flushes on its own export interval.
 */
export const AnalyticsServiceOtelLive = Layer.succeed(AnalyticsService, {
  record: (event, properties) => recordSpanEvent(`analytics.${event}`, properties ?? {}),
  flush: Effect.void,
});
