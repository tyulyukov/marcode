/**
 * ProviderRegistry - Provider snapshot service.
 *
 * Owns provider install/auth/version/model snapshots and exposes the latest
 * provider state to transport layers.
 *
 * @module ProviderRegistry
 */
import type { ProviderKind, ServerProvider, ServerProviderUpdateState } from "@marcode/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

export interface ProviderRegistryShape {
  /**
   * Read the latest provider snapshots.
   */
  readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>>;

  /**
   * Refresh all providers, or a single provider when specified.
   */
  readonly refresh: (provider?: ProviderKind) => Effect.Effect<ReadonlyArray<ServerProvider>>;

  /**
   * Apply volatile provider update state to the latest provider snapshot.
   */
  readonly setProviderUpdateState: (
    provider: ProviderKind,
    state: ServerProviderUpdateState | null,
  ) => Effect.Effect<ReadonlyArray<ServerProvider>>;

  /**
   * Stream of provider snapshot updates.
   */
  readonly streamChanges: Stream.Stream<ReadonlyArray<ServerProvider>>;
}

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "marcode/provider/Services/ProviderRegistry",
) {}
