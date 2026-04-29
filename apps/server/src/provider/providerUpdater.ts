import {
  ServerProviderUpdateError,
  type ProviderKind,
  type ServerProvider,
  type ServerProviderUpdatedPayload,
  type ServerProviderUpdateState,
} from "@marcode/contracts";
import { Cause, Effect, Ref } from "effect";
import * as Semaphore from "effect/Semaphore";

import type { ProcessRunResult } from "../processRunner.ts";
import { runProcess } from "../processRunner.ts";
import type { ServerSettingsShape } from "../serverSettings.ts";
import type { ProviderRegistryShape } from "./Services/ProviderRegistry.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  getProviderVersionLifecycle,
} from "./providerVersionLifecycle.ts";

const UPDATE_TIMEOUT_MS = 5 * 60_000;
const UPDATE_OUTPUT_MAX_BYTES = 10_000;

export type ProviderUpdateRunner = (
  command: string,
  args: ReadonlyArray<string>,
  options?: { readonly shell?: boolean },
) => Promise<ProcessRunResult>;

export interface ProviderUpdaterShape {
  readonly updateProvider: (
    provider: ProviderKind,
  ) => Effect.Effect<ServerProviderUpdatedPayload, ServerProviderUpdateError>;
}

interface VerifiedProviderRefresh {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly verifiedProvider: ServerProvider | undefined;
}

const defaultRunner: ProviderUpdateRunner = (command, args, options) =>
  runProcess(command, args, {
    timeoutMs: UPDATE_TIMEOUT_MS,
    maxBufferBytes: UPDATE_OUTPUT_MAX_BYTES,
    outputMode: "truncate",
    allowNonZeroExit: true,
    shell: options?.shell,
  });

function trimNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function commandOutput(result: ProcessRunResult): string | null {
  const output = trimNullable([result.stderr, result.stdout].filter(Boolean).join("\n\n"));
  if (!output) {
    return null;
  }
  return truncateText(output, UPDATE_OUTPUT_MAX_BYTES);
}

function failureMessage(result: ProcessRunResult): string {
  if (result.timedOut) {
    return "Update timed out.";
  }
  if (result.code !== null && result.code !== 0) {
    return `Update command exited with code ${result.code}.`;
  }
  if (result.signal) {
    return `Update command ended with signal ${result.signal}.`;
  }
  return "Update command failed.";
}

function isOutdatedProvider(provider: ServerProvider | undefined): boolean {
  return provider?.versionAdvisory?.status === "behind_latest";
}

function makeUpdateState(input: {
  readonly status: ServerProviderUpdateState["status"];
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly message: string | null;
  readonly output?: string | null;
}): ServerProviderUpdateState {
  return {
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    message: input.message,
    output: input.output ?? null,
  };
}

export const makeProviderUpdater = Effect.fn("makeProviderUpdater")(function* (input: {
  readonly providerRegistry: ProviderRegistryShape;
  readonly serverSettings?: ServerSettingsShape;
  readonly runUpdate?: ProviderUpdateRunner;
}) {
  const runningProvidersRef = yield* Ref.make<ReadonlySet<ProviderKind>>(new Set());
  const updateLocks = new Map<string, Semaphore.Semaphore>();
  for (const lifecycle of [
    getProviderVersionLifecycle("codex"),
    getProviderVersionLifecycle("claudeAgent"),
    getProviderVersionLifecycle("cursor"),
    getProviderVersionLifecycle("opencode"),
  ]) {
    if (lifecycle.updateLockKey && !updateLocks.has(lifecycle.updateLockKey)) {
      updateLocks.set(lifecycle.updateLockKey, yield* Semaphore.make(1));
    }
  }
  const runUpdate = input.runUpdate ?? defaultRunner;

  const acquireProvider = Effect.fn("acquireProvider")(function* (provider: ProviderKind) {
    return yield* Ref.modify(runningProvidersRef, (runningProviders) => {
      if (runningProviders.has(provider)) {
        return [false, runningProviders] as const;
      }
      const next = new Set(runningProviders);
      next.add(provider);
      return [true, next] as const;
    });
  });

  const releaseProvider = (provider: ProviderKind) =>
    Ref.update(runningProvidersRef, (runningProviders) => {
      const next = new Set(runningProviders);
      next.delete(provider);
      return next;
    });

  const verifyRefreshedProvider = (
    provider: ProviderKind,
  ): Effect.Effect<VerifiedProviderRefresh> =>
    input.providerRegistry.refresh(provider).pipe(
      Effect.flatMap((providers) => {
        const refreshedProvider = providers.find((candidate) => candidate.provider === provider);
        if (!refreshedProvider) {
          return Effect.succeed<VerifiedProviderRefresh>({
            providers,
            verifiedProvider: undefined,
          });
        }
        return Effect.promise<ServerProvider>(() =>
          enrichProviderSnapshotWithVersionAdvisory(refreshedProvider),
        ).pipe(
          Effect.map(
            (verifiedProvider): VerifiedProviderRefresh => ({ providers, verifiedProvider }),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("Provider post-update version verification failed", {
              provider,
              cause: Cause.pretty(cause),
            }).pipe(
              Effect.as<VerifiedProviderRefresh>({
                providers,
                verifiedProvider: refreshedProvider,
              }),
            ),
          ),
        );
      }),
    );

  const updateProvider: ProviderUpdaterShape["updateProvider"] = (provider) =>
    Effect.gen(function* () {
      const lifecycle = getProviderVersionLifecycle(provider);
      const settings = input.serverSettings
        ? yield* input.serverSettings.getSettings.pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Provider update command settings lookup failed", {
                provider,
                cause: Cause.pretty(cause),
              }).pipe(Effect.as(null)),
            ),
          )
        : null;
      const configuredCommand = settings?.providers[provider].updateCommand.trim() ?? "";
      const hasConfiguredCommand = configuredCommand.length > 0;
      const updateExecutable = hasConfiguredCommand
        ? configuredCommand
        : lifecycle.updateExecutable;
      const updateArgs = hasConfiguredCommand ? [] : lifecycle.updateArgs;
      const updateLockKey = lifecycle.updateLockKey;
      if (!updateExecutable || !updateLockKey) {
        return yield* new ServerProviderUpdateError({
          provider,
          reason: "This provider does not support one-click updates.",
        });
      }

      const acquired = yield* acquireProvider(provider);
      if (!acquired) {
        return yield* new ServerProviderUpdateError({
          provider,
          reason: "An update is already running for this provider.",
        });
      }

      yield* input.providerRegistry.setProviderUpdateState(
        provider,
        makeUpdateState({
          status: "queued",
          startedAt: null,
          finishedAt: null,
          message: "Waiting for another provider update to finish.",
        }),
      );

      const finish = (state: ServerProviderUpdateState) =>
        input.providerRegistry
          .setProviderUpdateState(provider, state)
          .pipe(Effect.map((providers) => ({ providers })));
      const startedAtRef = yield* Ref.make<string | null>(null);

      const run = Effect.gen(function* () {
        const startedAt = new Date().toISOString();
        yield* Ref.set(startedAtRef, startedAt);
        yield* input.providerRegistry.setProviderUpdateState(
          provider,
          makeUpdateState({
            status: "running",
            startedAt,
            finishedAt: null,
            message: "Updating provider.",
          }),
        );

        const result = yield* Effect.promise<ProcessRunResult>(() =>
          runUpdate(updateExecutable, updateArgs, {
            shell: hasConfiguredCommand,
          }),
        );
        const finishedAt = new Date().toISOString();
        if (result.timedOut || result.code !== 0) {
          return yield* finish(
            makeUpdateState({
              status: "failed",
              startedAt,
              finishedAt,
              message: failureMessage(result),
              output: commandOutput(result),
            }),
          );
        }

        const { verifiedProvider } = yield* verifyRefreshedProvider(provider);
        const couldNotVerify = verifiedProvider === undefined;
        const stillOutdated = couldNotVerify || isOutdatedProvider(verifiedProvider);
        return yield* finish(
          makeUpdateState({
            status: stillOutdated ? "unchanged" : "succeeded",
            startedAt,
            finishedAt,
            message: couldNotVerify
              ? "Update command completed, but MarCode could not verify the provider version."
              : stillOutdated
                ? "Update command completed, but MarCode still detects an outdated provider version."
                : "Provider updated.",
            output: commandOutput(result),
          }),
        );
      });
      const lock = updateLocks.get(updateLockKey)!;

      return yield* lock
        .withPermits(1)(run)
        .pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              const failure = Cause.squash(cause);
              const startedAt = yield* Ref.get(startedAtRef);
              return yield* finish(
                makeUpdateState({
                  status: "failed",
                  startedAt,
                  finishedAt: new Date().toISOString(),
                  message: failure instanceof Error ? failure.message : "Update command failed.",
                  output: null,
                }),
              );
            }),
          ),
          Effect.ensuring(releaseProvider(provider)),
        );
    });

  return {
    updateProvider,
  } satisfies ProviderUpdaterShape;
});
