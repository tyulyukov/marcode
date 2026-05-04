import { Effect, FileSystem, Layer, References, Tracer } from "effect";
import { HttpClient } from "effect/unstable/http";
import { OtlpMetrics, OtlpSerialization, OtlpTracer } from "effect/unstable/observability";

import packageJson from "../../../package.json" with { type: "json" };
import { ServerConfig } from "../../config.ts";
import { ServerLoggerLive } from "../../serverLogger.ts";
import { getTelemetryIdentifierWithKind } from "../../telemetry/Identify.ts";
import { makeLocalFileTracer } from "../LocalFileTracer.ts";
import { BrowserTraceCollector } from "../Services/BrowserTraceCollector.ts";
import { makeTraceSink } from "../TraceSink.ts";
import { wrapHttpClientWithOtlpAuth } from "./OtlpHttpClient.ts";

const otlpSerializationLayer = OtlpSerialization.layerJson;

export const ObservabilityLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const identity = yield* getTelemetryIdentifierWithKind;

    const resourceAttributes: Record<string, unknown> = {
      "service.runtime": "marcode-server",
      "service.mode": config.mode,
      "service.version": packageJson.version,
      "host.os.platform": process.platform,
      "host.os.arch": process.arch,
      ...(identity.id !== null ? { "user.id": identity.id } : {}),
      ...(identity.kind !== null ? { "user.id.kind": identity.kind } : {}),
    };

    const traceReferencesLayer = Layer.mergeAll(
      Layer.succeed(Tracer.MinimumTraceLevel, config.traceMinLevel),
      Layer.succeed(References.TracerTimingEnabled, config.traceTimingEnabled),
    );

    const tracerLayer = Layer.unwrap(
      Effect.gen(function* () {
        const baseHttpClient = yield* HttpClient.HttpClient;
        const fs = yield* FileSystem.FileSystem;
        const otlpHttpClient = wrapHttpClientWithOtlpAuth(baseHttpClient, config, fs);

        const sink = yield* makeTraceSink({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
        });
        const delegate =
          config.otlpTracesUrl === undefined
            ? undefined
            : yield* OtlpTracer.make({
                url: config.otlpTracesUrl,
                exportInterval: `${config.otlpExportIntervalMs} millis`,
                resource: {
                  serviceName: config.otlpServiceName,
                  attributes: resourceAttributes,
                },
              }).pipe(Effect.provideService(HttpClient.HttpClient, otlpHttpClient));

        const tracer = yield* makeLocalFileTracer({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
          sink,
          ...(delegate ? { delegate } : {}),
        });

        return Layer.mergeAll(
          Layer.succeed(Tracer.Tracer, tracer),
          Layer.succeed(BrowserTraceCollector, {
            record: (records) =>
              Effect.sync(() => {
                for (const record of records) {
                  sink.push(record);
                }
              }),
          }),
        );
      }),
    ).pipe(Layer.provideMerge(otlpSerializationLayer));

    const metricsLayer = Layer.unwrap(
      Effect.gen(function* () {
        if (config.otlpMetricsUrl === undefined) {
          return Layer.empty;
        }
        const baseHttpClient = yield* HttpClient.HttpClient;
        const fs = yield* FileSystem.FileSystem;
        const otlpHttpClient = wrapHttpClientWithOtlpAuth(baseHttpClient, config, fs);
        return OtlpMetrics.layer({
          url: config.otlpMetricsUrl,
          exportInterval: `${config.otlpExportIntervalMs} millis`,
          resource: {
            serviceName: config.otlpServiceName,
            attributes: resourceAttributes,
          },
        }).pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, otlpHttpClient)),
          Layer.provideMerge(otlpSerializationLayer),
        );
      }),
    );

    return Layer.mergeAll(ServerLoggerLive, traceReferencesLayer, tracerLayer, metricsLayer);
  }),
);
