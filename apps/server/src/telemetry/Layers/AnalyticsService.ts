import { Data, DateTime, Effect, Layer, Option, Ref } from "effect";

import { ServerConfig } from "../../config.ts";
import { JiraTokenService } from "../../jira/Services/JiraTokenService.ts";
import { AnalyticsService, type AnalyticsServiceShape } from "../Services/AnalyticsService.ts";
import { getTelemetryIdentifier } from "../Identify.ts";
import {
  JIRA_ACCESS_TOKEN_HEADER,
  makeProductSpanBatchPayload,
  type ProductAnalyticsSpanEvent,
  productAnalyticsUrlFromConfig,
  shouldAttachJiraProof,
} from "../OtlpProduct.ts";

export const AnalyticsServiceNoopLive = Layer.succeed(AnalyticsService, {
  record: () => Effect.void,
  flush: Effect.void,
});

interface BufferedAnalyticsEvent {
  readonly event: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly capturedAt: string;
  readonly durationMs?: number;
  readonly startedAt?: string | number | Date;
  readonly spanEvents?: ReadonlyArray<ProductAnalyticsSpanEvent>;
}

const MAX_BUFFERED_EVENTS = 1_000;
const FLUSH_BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 1_000;
const INITIAL_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const FAILURE_LOG_THROTTLE_MS = 60_000;

interface ProductAnalyticsExportState {
  readonly failures: number;
  readonly nextFlushAt: number;
  readonly lastWarningAt: number;
}

class ProductAnalyticsExportError extends Data.TaggedError("ProductAnalyticsExportError")<{
  readonly cause: unknown;
}> {}

export function productAnalyticsRetryDelayMs(failures: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, failures - 1));
}

const makeAnalyticsService = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const jiraTokenService = yield* Effect.serviceOption(JiraTokenService);
  const identifier = yield* getTelemetryIdentifier;
  const bufferRef = yield* Ref.make<ReadonlyArray<BufferedAnalyticsEvent>>([]);
  const exportStateRef = yield* Ref.make<ProductAnalyticsExportState>({
    failures: 0,
    nextFlushAt: 0,
    lastWarningAt: 0,
  });
  const productAnalyticsUrl = productAnalyticsUrlFromConfig(config);

  const makeBaseAttributes = () => ({
    ...(identifier
      ? {
          "analytics.user.id": identifier.id,
          "analytics.user.source": identifier.source,
        }
      : {}),
    "analytics.user.is_genesis": false,
    "app.mode": config.mode,
    "app.version": process.env.npm_package_version,
    platform: process.platform,
    arch: process.arch,
  });

  const getJiraProofHeader = Effect.gen(function* () {
    if (
      !productAnalyticsUrl ||
      !shouldAttachJiraProof({
        targetUrl: productAnalyticsUrl,
        jiraTokenProxyUrl: config.jiraTokenProxyUrl,
      })
    ) {
      return {};
    }
    const tokenService = Option.getOrUndefined(jiraTokenService);
    const accessToken = tokenService
      ? yield* tokenService.getValidAccessToken.pipe(Effect.catch(() => Effect.succeed(null)))
      : null;
    return accessToken ? { [JIRA_ACCESS_TOKEN_HEADER]: accessToken } : {};
  });

  const sendBatch = (events: ReadonlyArray<BufferedAnalyticsEvent>) =>
    Effect.gen(function* () {
      if (!productAnalyticsUrl || events.length === 0) return;
      const proofHeader = yield* getJiraProofHeader;
      yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(productAnalyticsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...proofHeader,
            },
            body: JSON.stringify(
              makeProductSpanBatchPayload(
                events.map((event) => ({
                  event: event.event,
                  capturedAt: event.capturedAt,
                  ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
                  ...(event.startedAt !== undefined ? { startedAt: event.startedAt } : {}),
                  ...(event.spanEvents !== undefined ? { spanEvents: event.spanEvents } : {}),
                  attributes: {
                    ...makeBaseAttributes(),
                    ...event.properties,
                  },
                })),
              ),
            ),
          });
          if (!response.ok) {
            throw new Error(`Product analytics export failed with status ${response.status}`);
          }
        },
        catch: (cause) => new ProductAnalyticsExportError({ cause }),
      });
    });

  const flush = Effect.gen(function* () {
    while (true) {
      const now = Date.now();
      const exportState = yield* Ref.get(exportStateRef);
      if (now < exportState.nextFlushAt) return;

      const batch = yield* Ref.modify(bufferRef, (current) => {
        if (current.length === 0) {
          return [[] as ReadonlyArray<BufferedAnalyticsEvent>, current] as const;
        }
        const nextBatch = current.slice(0, FLUSH_BATCH_SIZE);
        const remaining = current.slice(nextBatch.length);
        return [nextBatch, remaining] as const;
      });
      if (batch.length === 0) return;
      yield* sendBatch(batch).pipe(
        Effect.tap(() =>
          Ref.set(exportStateRef, {
            failures: 0,
            nextFlushAt: 0,
            lastWarningAt: 0,
          }),
        ),
        Effect.catch((cause) =>
          Effect.gen(function* () {
            const previous = yield* Ref.get(exportStateRef);
            const failures = previous.failures + 1;
            const retryDelayMs = productAnalyticsRetryDelayMs(failures);
            const shouldLog =
              previous.failures === 0 || now - previous.lastWarningAt >= FAILURE_LOG_THROTTLE_MS;

            yield* Ref.update(bufferRef, (current) => [...batch, ...current]);
            yield* Ref.set(exportStateRef, {
              failures,
              nextFlushAt: now + retryDelayMs,
              lastWarningAt: shouldLog ? now : previous.lastWarningAt,
            });
            if (shouldLog) {
              yield* Effect.logWarning("Failed to flush product analytics", {
                cause,
                retryDelayMs,
              });
            }
          }),
        ),
      );
    }
  }).pipe(Effect.catchCause(() => Effect.void));

  const record: AnalyticsServiceShape["record"] = (event, properties, options) =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        ...makeBaseAttributes(),
        ...properties,
      }).pipe(Effect.withSpan(event));

      const now = yield* DateTime.now;
      yield* Ref.update(bufferRef, (current) => {
        const appended = [
          ...current,
          {
            event,
            ...(properties ? { properties } : {}),
            capturedAt: DateTime.formatIso(now),
            ...(options?.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
            ...(options?.startedAt !== undefined ? { startedAt: options.startedAt } : {}),
            ...(options?.spanEvents !== undefined ? { spanEvents: options.spanEvents } : {}),
          },
        ];
        return appended.length > MAX_BUFFERED_EVENTS
          ? appended.slice(appended.length - MAX_BUFFERED_EVENTS)
          : appended;
      });
    });

  yield* Effect.forever(Effect.sleep(FLUSH_INTERVAL_MS).pipe(Effect.flatMap(() => flush)), {
    disableYield: true,
  }).pipe(Effect.forkScoped);
  yield* Effect.addFinalizer(() => flush);

  return { record, flush };
});

export const AnalyticsServiceLayerLive = Layer.effect(AnalyticsService, makeAnalyticsService);
