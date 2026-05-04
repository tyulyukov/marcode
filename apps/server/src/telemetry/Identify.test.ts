import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { afterEach, vi } from "vitest";

import { ServerConfig } from "../config.ts";
import { getTelemetryIdentifier, hashTelemetryIdentifier } from "./Identify.ts";

const identifyTestLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "marcode-identify-test-",
}).pipe(Layer.provide(NodeServices.layer));
const testLayer = Layer.mergeAll(identifyTestLayer, NodeServices.layer);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTelemetryIdentifier", () => {
  it.effect("falls back to a persisted anonymous id", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homeDir = yield* fs.makeTempDirectoryScoped({ prefix: "marcode-identify-home-" });
      vi.stubEnv("HOME", homeDir);
      const config = yield* ServerConfig;
      yield* fs.makeDirectory(path.dirname(config.anonymousIdPath), { recursive: true });
      yield* fs.writeFileString(config.anonymousIdPath, "anonymous-id");

      const identifier = yield* getTelemetryIdentifier;
      assert.deepEqual(identifier, {
        id: yield* hashTelemetryIdentifier("anonymous-id"),
        source: "anonymous",
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("creates an anonymous id when missing", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const homeDir = yield* fs.makeTempDirectoryScoped({ prefix: "marcode-identify-home-" });
      vi.stubEnv("HOME", homeDir);
      const identifier = yield* getTelemetryIdentifier;
      const persisted = yield* fs.readFileString(config.anonymousIdPath);

      assert.equal(identifier?.source, "anonymous");
      assert.equal(persisted.trim().length > 0, true);
    }).pipe(Effect.provide(testLayer)),
  );
});
