import { Context } from "effect";
import type { Effect } from "effect";

export interface AnalyticsServiceShape {
  readonly record: (event: string, properties?: Record<string, unknown>) => Effect.Effect<void>;
  readonly flush: Effect.Effect<void>;
}

export class AnalyticsService extends Context.Service<AnalyticsService, AnalyticsServiceShape>()(
  "marcode/telemetry/AnalyticsService",
) {}
