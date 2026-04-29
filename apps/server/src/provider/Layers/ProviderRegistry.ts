/**
 * ProviderRegistryLive - Aggregates provider-specific snapshot services.
 *
 * @module ProviderRegistryLive
 */
import type { ProviderKind, ServerProvider, ServerProviderUpdateState } from "@marcode/contracts";
import { Effect, Equal, FileSystem, Layer, Path, PubSub, Ref, Stream } from "effect";

import { ServerConfig } from "../../config.ts";
import { ClaudeProviderLive } from "./ClaudeProvider.ts";
import { CodexProviderLive } from "./CodexProvider.ts";
import { CursorProviderLive } from "./CursorProvider.ts";
import { OpenCodeProviderLive } from "./OpenCodeProvider.ts";
import { ClaudeProvider } from "../Services/ClaudeProvider.ts";
import { CodexProvider } from "../Services/CodexProvider.ts";
import { CursorProvider } from "../Services/CursorProvider.ts";
import { OpenCodeProvider } from "../Services/OpenCodeProvider.ts";
import { ProviderRegistry, type ProviderRegistryShape } from "../Services/ProviderRegistry.ts";
import { OpenCodeRuntimeLive } from "../opencodeRuntime.ts";
import {
  hydrateCachedProvider,
  PROVIDER_CACHE_IDS,
  orderProviderSnapshots,
  readProviderStatusCache,
  resolveProviderStatusCachePath,
  writeProviderStatusCache,
} from "../providerStatusCache.ts";
import { createBuiltInProviderSources } from "../builtInProviderCatalog.ts";
import type { ProviderSnapshotSource } from "../builtInProviderCatalog.ts";

const loadProviders = (
  providerSources: ReadonlyArray<ProviderSnapshotSource>,
): Effect.Effect<ReadonlyArray<ServerProvider>> =>
  Effect.forEach(providerSources, (providerSource) => providerSource.getSnapshot, {
    concurrency: "unbounded",
  });

const hasModelCapabilities = (model: ServerProvider["models"][number]): boolean =>
  (model.capabilities?.optionDescriptors?.length ?? 0) > 0;

const mergeProviderModels = (
  previousModels: ReadonlyArray<ServerProvider["models"][number]>,
  nextModels: ReadonlyArray<ServerProvider["models"][number]>,
): ReadonlyArray<ServerProvider["models"][number]> => {
  if (nextModels.length === 0 && previousModels.length > 0) {
    return previousModels;
  }

  const previousBySlug = new Map(previousModels.map((model) => [model.slug, model] as const));
  const mergedModels = nextModels.map((model) => {
    const previousModel = previousBySlug.get(model.slug);
    if (!previousModel || hasModelCapabilities(model) || !hasModelCapabilities(previousModel)) {
      return model;
    }
    return {
      ...model,
      capabilities: previousModel.capabilities,
    };
  });
  const nextSlugs = new Set(nextModels.map((model) => model.slug));
  return [...mergedModels, ...previousModels.filter((model) => !nextSlugs.has(model.slug))];
};

export const mergeProviderSnapshot = (
  previousProvider: ServerProvider | undefined,
  nextProvider: ServerProvider,
): ServerProvider =>
  !previousProvider
    ? nextProvider
    : {
        ...nextProvider,
        models: mergeProviderModels(previousProvider.models, nextProvider.models),
      };

export const mergeProviderSnapshots = (
  previousProviders: ReadonlyArray<ServerProvider>,
  nextProviders: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ServerProvider> => {
  const mergedProviders = new Map(
    previousProviders.map((provider) => [provider.provider, provider] as const),
  );

  for (const provider of nextProviders) {
    mergedProviders.set(
      provider.provider,
      mergeProviderSnapshot(mergedProviders.get(provider.provider), provider),
    );
  }

  return orderProviderSnapshots([...mergedProviders.values()]);
};

export const selectProvidersByKind = (
  providers: ReadonlyArray<ServerProvider>,
  providerKinds: ReadonlySet<ProviderKind>,
): ReadonlyArray<ServerProvider> =>
  providers.filter((provider) => providerKinds.has(provider.provider));

export const haveProvidersChanged = (
  previousProviders: ReadonlyArray<ServerProvider>,
  nextProviders: ReadonlyArray<ServerProvider>,
): boolean => !Equal.equals(previousProviders, nextProviders);

const ProviderRegistryLiveBase = Layer.effect(
  ProviderRegistry,
  Effect.gen(function* () {
    const codexProvider = yield* CodexProvider;
    const claudeProvider = yield* ClaudeProvider;
    const openCodeProvider = yield* OpenCodeProvider;
    const config = yield* ServerConfig;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const cursorProvider = yield* CursorProvider;

    const providerSources = createBuiltInProviderSources({
      codex: codexProvider,
      claudeAgent: claudeProvider,
      opencode: openCodeProvider,
      cursor: cursorProvider,
    }) satisfies ReadonlyArray<ProviderSnapshotSource>;
    const activeProviders = PROVIDER_CACHE_IDS;
    const changesPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ReadonlyArray<ServerProvider>>(),
      PubSub.shutdown,
    );
    const fallbackProviders = yield* loadProviders(providerSources);
    const cachePathByProvider = new Map(
      activeProviders.map(
        (provider) =>
          [
            provider,
            resolveProviderStatusCachePath({
              cacheDir: config.providerStatusCacheDir,
              provider,
            }),
          ] as const,
      ),
    );
    const fallbackByProvider = new Map(
      fallbackProviders.map((provider) => [provider.provider, provider] as const),
    );

    const cachedProviders = yield* Effect.forEach(
      activeProviders,
      (provider) => {
        const filePath = cachePathByProvider.get(provider)!;
        const fallbackProvider = fallbackByProvider.get(provider)!;
        return readProviderStatusCache(filePath).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.map((cachedProvider) =>
            cachedProvider === undefined
              ? undefined
              : hydrateCachedProvider({
                  cachedProvider,
                  fallbackProvider,
                }),
          ),
        );
      },
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((providers) =>
        orderProviderSnapshots(
          providers.filter((provider): provider is ServerProvider => provider !== undefined),
        ),
      ),
    );
    const providersRef = yield* Ref.make<ReadonlyArray<ServerProvider>>(cachedProviders);
    const updateStatesRef = yield* Ref.make<ReadonlyMap<ProviderKind, ServerProviderUpdateState>>(
      new Map(),
    );

    const applyProviderUpdateState = Effect.fn("applyProviderUpdateState")(function* (
      provider: ServerProvider,
    ) {
      const updateStates = yield* Ref.get(updateStatesRef);
      const updateState = updateStates.get(provider.provider);
      if (!updateState) {
        const { updateState: _updateState, ...providerWithoutUpdateState } = provider;
        return providerWithoutUpdateState;
      }
      return {
        ...provider,
        updateState,
      };
    });

    const persistProvider = (provider: ServerProvider) =>
      writeProviderStatusCache({
        filePath: cachePathByProvider.get(provider.provider)!,
        provider,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.tapError(Effect.logError),
        Effect.ignore,
      );

    const upsertProviders = Effect.fn("upsertProviders")(function* (
      nextProviders: ReadonlyArray<ServerProvider>,
      options?: {
        readonly publish?: boolean;
      },
    ) {
      const nextProvidersWithUpdateState = yield* Effect.forEach(
        nextProviders,
        applyProviderUpdateState,
        {
          concurrency: "unbounded",
        },
      );
      const [previousProviders, providers] = yield* Ref.modify(providersRef, (previousProviders) =>
        ((providers) => [[previousProviders, providers] as const, providers])(
          mergeProviderSnapshots(previousProviders, nextProvidersWithUpdateState),
        ),
      );

      if (haveProvidersChanged(previousProviders, providers)) {
        const updatedProviderKinds = new Set(
          nextProvidersWithUpdateState.map((provider) => provider.provider),
        );
        yield* Effect.forEach(
          selectProvidersByKind(providers, updatedProviderKinds),
          persistProvider,
          {
            concurrency: "unbounded",
            discard: true,
          },
        );
        if (options?.publish !== false) {
          yield* PubSub.publish(changesPubSub, providers);
        }
      }

      return providers;
    });

    const syncProvider = Effect.fn("syncProvider")(function* (
      provider: ServerProvider,
      options?: {
        readonly publish?: boolean;
      },
    ) {
      return yield* upsertProviders([provider], options);
    });

    const setProviderUpdateState = Effect.fn("setProviderUpdateState")(function* (
      provider: ProviderKind,
      state: ServerProviderUpdateState | null,
    ) {
      yield* Ref.update(updateStatesRef, (previous) => {
        const next = new Map(previous);
        if (state === null || state.status === "idle") {
          next.delete(provider);
          return next;
        }
        next.set(provider, state);
        return next;
      });

      const existingProviders = yield* Ref.get(providersRef);
      const existingProvider = existingProviders.find(
        (candidate) => candidate.provider === provider,
      );
      if (!existingProvider) {
        return existingProviders;
      }

      const nextProvider = yield* applyProviderUpdateState(existingProvider);
      return yield* syncProvider(nextProvider);
    });

    const refresh = Effect.fn("refresh")(function* (provider?: ProviderKind) {
      if (provider) {
        const providerSource = providerSources.find((candidate) => candidate.provider === provider);
        if (!providerSource) {
          return yield* Ref.get(providersRef);
        }
        return yield* providerSource.refresh.pipe(
          Effect.flatMap((nextProvider) => syncProvider(nextProvider)),
        );
      }

      return yield* Effect.forEach(
        providerSources,
        (providerSource) => providerSource.refresh.pipe(Effect.flatMap(syncProvider)),
        {
          concurrency: "unbounded",
          discard: true,
        },
      ).pipe(Effect.andThen(Ref.get(providersRef)));
    });

    yield* Effect.forEach(
      providerSources,
      (providerSource) =>
        Stream.runForEach(providerSource.streamChanges, (provider) => syncProvider(provider)).pipe(
          Effect.forkScoped,
        ),
      {
        concurrency: "unbounded",
        discard: true,
      },
    );
    yield* loadProviders(providerSources).pipe(
      Effect.flatMap((providers) => upsertProviders(providers, { publish: false })),
    );

    return {
      getProviders: Ref.get(providersRef),
      refresh: (provider?: ProviderKind) =>
        refresh(provider).pipe(
          Effect.tapError(Effect.logError),
          Effect.orElseSucceed(() => [] as ReadonlyArray<ServerProvider>),
        ),
      setProviderUpdateState,
      get streamChanges() {
        return Stream.fromPubSub(changesPubSub);
      },
    } satisfies ProviderRegistryShape;
  }),
);

export const ProviderRegistryLive = Layer.unwrap(
  Effect.sync(() =>
    ProviderRegistryLiveBase.pipe(
      Layer.provideMerge(CursorProviderLive),
      Layer.provideMerge(CodexProviderLive),
      Layer.provideMerge(ClaudeProviderLive),
      Layer.provideMerge(OpenCodeProviderLive),
      Layer.provideMerge(OpenCodeRuntimeLive),
    ),
  ),
);
