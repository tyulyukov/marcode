import type { ProviderKind, ServerProviderUsageLimits } from "@marcode/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

export interface StoredProviderUsageLimits {
  readonly provider: ProviderKind;
  readonly usageLimits: ServerProviderUsageLimits;
}

export interface UsageLimitsRepositoryShape {
  readonly upsert: (entry: StoredProviderUsageLimits) => Effect.Effect<boolean>;
  readonly get: (provider: ProviderKind) => Effect.Effect<ServerProviderUsageLimits | undefined>;
  readonly streamChanges: Stream.Stream<StoredProviderUsageLimits>;
}

export class UsageLimitsRepository extends ServiceMap.Service<
  UsageLimitsRepository,
  UsageLimitsRepositoryShape
>()("marcode/provider/Services/UsageLimitsRepository") {}
