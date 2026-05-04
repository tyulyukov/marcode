import { Data, DateTime, Effect, Layer, Option, Ref } from "effect";

import { ServerConfig } from "../../config.ts";
import { JiraTokenService } from "../../jira/Services/JiraTokenService.ts";
import { AnalyticsService } from "../Services/AnalyticsService.ts";
import { getTelemetryIdentifier } from "../Identify.ts";
import {
  JIRA_ACCESS_TOKEN_HEADER,
  makeProductSpanPayload,
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
}

const MAX_BUFFERED_EVENTS = 1_000;
const FLUSH_BATCH_SIZE = 20;

class ProductAnalyticsExportError extends Data.TaggedError("ProductAnalyticsExportError")<{
  readonly cause: unknown;
}> {}

const makeAnalyticsService = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const jiraTokenService = yield* Effect.serviceOption(JiraTokenService);
  const identifier = yield* getTelemetryIdentifier;
  const bufferRef = yield* Ref.make<ReadonlyArray<BufferedAnalyticsEvent>>([]);
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
      yield* Effect.forEach(
        events,
        (event) =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(productAnalyticsUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...proofHeader,
                },
                body: JSON.stringify(
                  makeProductSpanPayload({
                    event: event.event,
                    capturedAt: event.capturedAt,
                    attributes: {
                      ...makeBaseAttributes(),
                      ...event.properties,
                    },
                  }),
                ),
              });
              if (!response.ok) {
                throw new Error(`Product analytics export failed with status ${response.status}`);
              }
            },
            catch: (cause) => new ProductAnalyticsExportError({ cause }),
          }),
        { discard: true, concurrency: 2 },
      );
    });

  const flush = Effect.gen(function* () {
    while (true) {
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
        Effect.catch((cause) =>
          Effect.all(
            [
              Ref.update(bufferRef, (current) => [...batch, ...current]),
              Effect.logWarning("Failed to flush product analytics", { cause }),
            ],
            { discard: true },
          ),
        ),
      );
    }
  }).pipe(Effect.catchCause(() => Effect.void));

  const record = (event: string, properties?: Record<string, unknown>) =>
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
          },
        ];
        return appended.length > MAX_BUFFERED_EVENTS
          ? appended.slice(appended.length - MAX_BUFFERED_EVENTS)
          : appended;
      });
    });

  yield* Effect.forever(Effect.sleep(1000).pipe(Effect.flatMap(() => flush)), {
    disableYield: true,
  }).pipe(Effect.forkScoped);
  yield* Effect.addFinalizer(() => flush);

  return { record, flush };
});

export const AnalyticsServiceLayerLive = Layer.effect(AnalyticsService, makeAnalyticsService);
