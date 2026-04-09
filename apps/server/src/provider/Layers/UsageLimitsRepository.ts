import type { ProviderKind, ServerProviderUsageLimits } from "@marcode/contracts";
import { Effect, Layer, PubSub, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  UsageLimitsRepository,
  type StoredProviderUsageLimits,
  type UsageLimitsRepositoryShape,
} from "../Services/UsageLimitsRepository";

interface UsageLimitsRow {
  readonly provider_name: string;
  readonly updated_at: string;
  readonly payload_json: string;
}

function parsePayloadJson(json: string): ServerProviderUsageLimits | undefined {
  try {
    return JSON.parse(json) as ServerProviderUsageLimits;
  } catch {
    return undefined;
  }
}

export const UsageLimitsRepositoryLive = Layer.effect(
  UsageLimitsRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const changesPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<StoredProviderUsageLimits>(),
      PubSub.shutdown,
    );

    const upsert = (entry: StoredProviderUsageLimits): Effect.Effect<boolean> => {
      const payloadJson = JSON.stringify(entry.usageLimits);
      return sql<UsageLimitsRow>`
        INSERT INTO provider_usage_limits (provider_name, updated_at, payload_json)
        VALUES (${entry.provider}, ${entry.usageLimits.updatedAt}, ${payloadJson})
        ON CONFLICT (provider_name)
        DO UPDATE SET
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json
        WHERE excluded.updated_at > provider_usage_limits.updated_at
        RETURNING *
      `.pipe(
        Effect.flatMap((rows) => {
          if (rows.length === 0) return Effect.succeed(false);
          return PubSub.publish(changesPubSub, entry).pipe(Effect.map(() => true));
        }),
        Effect.tapError(Effect.logError),
        Effect.orElseSucceed(() => false),
      );
    };

    const get = (provider: ProviderKind): Effect.Effect<ServerProviderUsageLimits | undefined> =>
      sql<UsageLimitsRow>`
        SELECT provider_name, updated_at, payload_json
        FROM provider_usage_limits
        WHERE provider_name = ${provider}
        LIMIT 1
      `.pipe(
        Effect.map((rows) =>
          rows.length > 0 ? parsePayloadJson(rows[0]!.payload_json) : undefined,
        ),
        Effect.tapError(Effect.logError),
        Effect.orElseSucceed(() => undefined),
      );

    return {
      upsert,
      get,
      get streamChanges() {
        return Stream.fromPubSub(changesPubSub);
      },
    } satisfies UsageLimitsRepositoryShape;
  }),
);
