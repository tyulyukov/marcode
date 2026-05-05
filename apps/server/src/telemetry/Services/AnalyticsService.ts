import { Context } from "effect";
import type { Effect } from "effect";

export interface AnalyticsServiceShape {
  readonly record: (
    event: string,
    properties?: Record<string, unknown>,
    options?: {
      readonly durationMs?: number;
      readonly startedAt?: string | number | Date;
      readonly spanEvents?: ReadonlyArray<{
        readonly name: string;
        readonly attributes?: Record<string, unknown>;
        readonly at?: string | number | Date;
      }>;
    },
  ) => Effect.Effect<void>;
  readonly flush: Effect.Effect<void>;
}

export class AnalyticsService extends Context.Service<AnalyticsService, AnalyticsServiceShape>()(
  "marcode/telemetry/AnalyticsService",
) {}
