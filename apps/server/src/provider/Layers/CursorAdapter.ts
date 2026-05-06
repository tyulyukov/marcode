/**
 * CursorAdapterLive — Cursor CLI (`agent acp`) via ACP.
 *
 * @module CursorAdapterLive
 */
import * as nodePath from "node:path";

import {
  ApprovalRequestId,
  type ProviderOptionSelection,
  EventId,
  type ProviderApprovalDecision,
  type ProviderInteractionMode,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderUserInputAnswers,
  RuntimeRequestId,
  type RuntimeMode,
  RuntimeTaskId,
  type ThreadId,
  TurnId,
} from "@marcode/contracts";
import {
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  PubSub,
  Random,
  Scope,
  Semaphore,
  Stream,
  SynchronizedRef,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import { acpPermissionOutcome, mapAcpToAdapterError } from "../acp/AcpAdapterSupport.ts";
import { type AcpSessionRuntimeShape } from "../acp/AcpSessionRuntime.ts";
import {
  makeAcpAssistantItemEvent,
  makeAcpContentDeltaEvent,
  makeAcpPlanUpdatedEvent,
  makeAcpRequestOpenedEvent,
  makeAcpRequestResolvedEvent,
  makeAcpToolCallEvent,
} from "../acp/AcpCoreRuntimeEvents.ts";
import {
  type AcpSessionMode,
  type AcpSessionModeState,
  type AcpToolCallState,
  parsePermissionRequest,
} from "../acp/AcpRuntimeModel.ts";
import { makeAcpNativeLoggers } from "../acp/AcpNativeLogging.ts";
import { applyCursorAcpModelSelection, makeCursorAcpRuntime } from "../acp/CursorAcpSupport.ts";
import {
  CursorAskQuestionRequest,
  CursorCreatePlanRequest,
  CursorTaskNotification,
  CursorUpdateTodosRequest,
  extractAskQuestions,
  extractPlanMarkdown,
  extractTodosAsPlan,
} from "../acp/CursorAcpExtension.ts";
import { CursorAdapter, type CursorAdapterShape } from "../Services/CursorAdapter.ts";
import { resolveCursorAcpBaseModelId } from "./CursorProvider.ts";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = "cursor" as const;
const CURSOR_RESUME_VERSION = 1 as const;
const ACP_PLAN_MODE_ALIASES = ["plan", "architect"];
const ACP_IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"];
const ACP_APPROVAL_MODE_ALIASES = ["ask"];

export interface CursorAdapterLiveOptions {
  readonly nativeEventLogPath?: string;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
  readonly kind: string | "unknown";
}

interface PendingUserInput {
  readonly answers: Deferred.Deferred<ProviderUserInputAnswers>;
}

// Tracks a terminal spawned via Cursor's `terminal/create` request. The
// `command` field is the primary reason we opt into Cursor's terminal
// capability: it's the only shape where we're guaranteed to see the actual
// shell command text, which we then merge into the tool_call event so the
// CommandExecutionCard renders something other than a blank "Ran command".
interface CursorTerminalEntry {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly outputByteLimit: number | undefined;
  readonly exitDeferred: Deferred.Deferred<{
    readonly exitCode: number | null;
    readonly signal: string | null;
  }>;
  readonly kill: Effect.Effect<void>;
  output: string;
  released: boolean;
  exited: boolean;
}

interface CursorSessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly acp: AcpSessionRuntimeShape;
  notificationFiber: Fiber.Fiber<void, never> | undefined;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly pendingUserInputs: Map<ApprovalRequestId, PendingUserInput>;
  readonly turns: Array<{ id: TurnId; items: Array<unknown> }>;
  // Cursor emits the real command/title in `session/request_permission`
  // (title is backtick-wrapped like `` `rg -i 'effect'` ``), but the
  // subsequent `session/update` tool_call only carries the coarse title
  // "Terminal". Stash whatever we learn from the permission request here,
  // keyed by `toolCallId`, so we can re-inject it into the tool_call event
  // and show the user the actual command that ran.
  //
  // KNOWN LIMITATION: when a shell command matches the user's allowlist in
  // `~/.cursor/cli-config.json` (`Shell(ls)`, `Shell(rg)`, …), Cursor skips
  // `request_permission` entirely AND still ships an empty `rawInput:{}` on
  // the `tool_call` — so we have *no* channel to recover the command text.
  // Confirmed Cursor server-side bug (Mohit, Cursor team, forum.cursor.com
  // /t/acp-tool-call-events-for-mcp-tools-contain-no-tool-identity-title-
  // rawinput-empty/155896): "tool_call event is emitted before tool
  // arguments are fully parsed, and a deduplication guard prevents it from
  // being re-emitted once the full data is available". The web-side
  // CommandExecutionCard renders a "Command text unavailable" placeholder
  // with a tooltip pointing users at the cli-config.json workaround.
  readonly toolCallHints: Map<string, { readonly command?: string; readonly title?: string }>;
  // Terminals spawned via Cursor's `terminal/create` request, keyed by
  // terminalId. Cursor later references these in `session/update` tool_call
  // events via `content: [{ type: "terminal", terminalId }]`, and we pull the
  // command text from here to populate the hint for the tool call.
  readonly terminals: Map<string, CursorTerminalEntry>;
  readonly activeSubagentTaskIds: Set<string>;
  readonly completedSubagentTaskIds: Set<string>;
  lastPlanFingerprint: string | undefined;
  activeTurnId: TurnId | undefined;
  stopped: boolean;
}

function settlePendingApprovalsAsCancelled(
  pendingApprovals: ReadonlyMap<ApprovalRequestId, PendingApproval>,
): Effect.Effect<void> {
  const pendingEntries = Array.from(pendingApprovals.values());
  return Effect.forEach(
    pendingEntries,
    (pending) => Deferred.succeed(pending.decision, "cancel").pipe(Effect.ignore),
    {
      discard: true,
    },
  );
}

function settlePendingUserInputsAsEmptyAnswers(
  pendingUserInputs: ReadonlyMap<ApprovalRequestId, PendingUserInput>,
): Effect.Effect<void> {
  const pendingEntries = Array.from(pendingUserInputs.values());
  return Effect.forEach(
    pendingEntries,
    (pending) => Deferred.succeed(pending.answers, {}).pipe(Effect.ignore),
    {
      discard: true,
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCursorResume(raw: unknown): { sessionId: string } | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.schemaVersion !== CURSOR_RESUME_VERSION) return undefined;
  if (typeof raw.sessionId !== "string" || !raw.sessionId.trim()) return undefined;
  return { sessionId: raw.sessionId.trim() };
}

// Join a command + args list into a readable, single-line shell form suitable
// for display in the CommandExecutionCard. Not a full POSIX quoter — just
// enough to disambiguate args that contain whitespace or shell metachars.
function formatShellCommand(command: string, args: ReadonlyArray<string>): string {
  const quote = (segment: string): string => {
    if (segment.length > 0 && /^[\w@%+=:,./-]+$/u.test(segment)) {
      return segment;
    }
    return `'${segment.replace(/'/gu, `'\\''`)}'`;
  };
  return [command, ...args].map(quote).join(" ");
}

// Resolve a turnId for extension-notification events that may fire outside a
// turn boundary. Prefers the currently-active turn, falls back to the most
// recent known turn so late notifications (e.g. `cursor/task`, which Cursor
// fires post-completion) still attach to a real turn instead of being dropped
// by the session-logic filter that requires `activity.turnId === latestTurnId`.
export function resolveEffectiveTurnId(
  ctx:
    | {
        readonly activeTurnId: TurnId | undefined;
        readonly turns: ReadonlyArray<{ readonly id: TurnId }>;
      }
    | undefined,
): TurnId | undefined {
  if (!ctx) return undefined;
  if (ctx.activeTurnId) return ctx.activeTurnId;
  const lastTurn = ctx.turns[ctx.turns.length - 1];
  return lastTurn?.id;
}

function cursorSubagentTaskId(turnId: TurnId | undefined): string | undefined {
  return turnId ? `cursor-subagent:${String(turnId)}` : undefined;
}

function isCursorSubagentToolCall(toolCall: AcpToolCallState): boolean {
  return /\nctc_[A-Za-z0-9_-]+/u.test(toolCall.toolCallId);
}

function cursorSubagentProgressDescription(toolCall: AcpToolCallState): string {
  return toolCall.detail ?? toolCall.title ?? toolCall.kind ?? "Cursor subagent activity";
}

function normalizeModeSearchText(mode: AcpSessionMode): string {
  return [mode.id, mode.name, mode.description]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findModeByAliases(
  modes: ReadonlyArray<AcpSessionMode>,
  aliases: ReadonlyArray<string>,
): AcpSessionMode | undefined {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  for (const alias of normalizedAliases) {
    const exact = modes.find((mode) => {
      const id = mode.id.toLowerCase();
      const name = mode.name.toLowerCase();
      return id === alias || name === alias;
    });
    if (exact) {
      return exact;
    }
  }
  for (const alias of normalizedAliases) {
    const partial = modes.find((mode) => normalizeModeSearchText(mode).includes(alias));
    if (partial) {
      return partial;
    }
  }
  return undefined;
}

function isPlanMode(mode: AcpSessionMode): boolean {
  return findModeByAliases([mode], ACP_PLAN_MODE_ALIASES) !== undefined;
}

function resolveRequestedModeId(input: {
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly modeState: AcpSessionModeState | undefined;
}): string | undefined {
  const modeState = input.modeState;
  if (!modeState) {
    return undefined;
  }

  if (input.interactionMode === "plan") {
    return findModeByAliases(modeState.availableModes, ACP_PLAN_MODE_ALIASES)?.id;
  }

  if (input.runtimeMode === "approval-required") {
    return (
      findModeByAliases(modeState.availableModes, ACP_APPROVAL_MODE_ALIASES)?.id ??
      findModeByAliases(modeState.availableModes, ACP_IMPLEMENT_MODE_ALIASES)?.id ??
      modeState.availableModes.find((mode) => !isPlanMode(mode))?.id ??
      modeState.currentModeId
    );
  }

  return (
    findModeByAliases(modeState.availableModes, ACP_IMPLEMENT_MODE_ALIASES)?.id ??
    findModeByAliases(modeState.availableModes, ACP_APPROVAL_MODE_ALIASES)?.id ??
    modeState.availableModes.find((mode) => !isPlanMode(mode))?.id ??
    modeState.currentModeId
  );
}

function applyRequestedSessionConfiguration<E>(input: {
  readonly runtime: AcpSessionRuntimeShape;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly modelSelection:
    | {
        readonly model: string;
        readonly options?: ReadonlyArray<ProviderOptionSelection> | null | undefined;
      }
    | undefined;
  readonly mapError: (context: {
    readonly cause: import("effect-acp/errors").AcpError;
    readonly method: "session/set_config_option" | "session/set_mode";
  }) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    if (input.modelSelection) {
      yield* applyCursorAcpModelSelection({
        runtime: input.runtime,
        model: input.modelSelection.model,
        selections: input.modelSelection.options,
        mapError: ({ cause }) =>
          input.mapError({
            cause,
            method: "session/set_config_option",
          }),
      });
    }

    const requestedModeId = resolveRequestedModeId({
      interactionMode: input.interactionMode,
      runtimeMode: input.runtimeMode,
      modeState: yield* input.runtime.getModeState,
    });
    if (!requestedModeId) {
      return;
    }

    yield* input.runtime.setMode(requestedModeId).pipe(
      Effect.mapError((cause) =>
        input.mapError({
          cause,
          method: "session/set_mode",
        }),
      ),
    );
  });
}

/**
 * Overlay a command/title learned from a `session/request_permission` onto
 * the subsequent `session/update` tool_call state. Cursor emits the actual
 * command only on the permission request (the tool_call itself just says
 * "Terminal"), so without this merge the client sees a "Ran command" pill
 * with no command text.
 *
 * IMPORTANT: this only fills `command` (and `data.command`) — never `detail`.
 * Detail is reserved for the command's *output*; the client's
 * `summarizeToolRawOutput` derives it from `data.rawOutput.stdout/stderr`. If
 * we clobbered detail with the command text, CommandExecutionCard's
 * `detailIsDistinctOutput` guard would treat detail === command and hide the
 * stdout body, leaving the user with a command pill but no visible output.
 */
export function applyToolCallHint(
  state: AcpToolCallState,
  hint: { readonly command?: string; readonly title?: string } | undefined,
): AcpToolCallState {
  if (!hint) return state;
  if (state.command) return state;
  if (!hint.command) return state;
  return {
    ...state,
    command: hint.command,
    data: { ...state.data, command: hint.command },
  };
}

/**
 * Derive a tool_call hint from a matching `terminal/create` entry when the
 * tool_call's `content[]` references a terminal we own (via a `{ type:
 * "terminal", terminalId }` block). This is the primary channel for the
 * command text once we advertise `terminal: true` to Cursor — the
 * `session/request_permission` stash in `toolCallHints` is the fallback for
 * Cursor versions that skip `terminal/create`.
 */
export function resolveTerminalHintFromToolCall(
  toolCall: AcpToolCallState,
  terminals: ReadonlyMap<string, { readonly command: string }>,
): { readonly command: string } | undefined {
  const content = toolCall.data.content;
  if (!Array.isArray(content)) return undefined;
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "terminal") continue;
    const terminalId = record.terminalId;
    if (typeof terminalId !== "string" || terminalId.length === 0) continue;
    const terminal = terminals.get(terminalId);
    if (terminal?.command) {
      return { command: terminal.command };
    }
  }
  return undefined;
}

// Prefer `allow_once` over `allow_always` so Full-Access auto-approval does
// not mutate the user's persistent `~/.cursor/cli-config.json` allowlist.
//
// `allow_always` makes Cursor write `Shell(<commandBase>)` (or equivalent) to
// the cli-config permissions array, which means the *next* invocation of that
// command base never triggers `session/request_permission` — and since
// Cursor's `tool_call` event ships an empty `rawInput:{}` and the generic
// title `"Terminal"`, losing the permission event also loses the only channel
// that carries the actual command text. The CommandExecutionCard then degrades
// to "Ran command" with no detail. `allow_once` keeps every invocation routed
// through `request_permission`, so `applyToolCallHint` keeps populating the
// command on every run. Falls back to `allow_always` only if the agent did
// not advertise `allow_once`.
export function selectAutoApprovedPermissionOption(
  request: EffectAcpSchema.RequestPermissionRequest,
): string | undefined {
  const allowOnceOption = request.options.find((option) => option.kind === "allow_once");
  if (typeof allowOnceOption?.optionId === "string" && allowOnceOption.optionId.trim()) {
    return allowOnceOption.optionId.trim();
  }

  const allowAlwaysOption = request.options.find((option) => option.kind === "allow_always");
  if (typeof allowAlwaysOption?.optionId === "string" && allowAlwaysOption.optionId.trim()) {
    return allowAlwaysOption.optionId.trim();
  }

  return undefined;
}

function makeCursorAdapter(options?: CursorAdapterLiveOptions) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* Effect.service(ServerConfig);
    const serverSettingsService = yield* ServerSettingsService;
    const nativeEventLogger =
      options?.nativeEventLogger ??
      (options?.nativeEventLogPath !== undefined
        ? yield* makeEventNdjsonLogger(options.nativeEventLogPath, {
            stream: "native",
          })
        : undefined);
    const managedNativeEventLogger =
      options?.nativeEventLogger === undefined ? nativeEventLogger : undefined;

    const sessions = new Map<ThreadId, CursorSessionContext>();
    const threadLocksRef = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>());
    const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const nextEventId = Effect.map(Random.nextUUIDv4, (id) => EventId.make(id));
    const makeEventStamp = () => Effect.all({ eventId: nextEventId, createdAt: nowIso });

    const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
      PubSub.publish(runtimeEventPubSub, event).pipe(Effect.asVoid);

    const getThreadSemaphore = (threadId: string) =>
      SynchronizedRef.modifyEffect(threadLocksRef, (current) => {
        const existing: Option.Option<Semaphore.Semaphore> = Option.fromNullishOr(
          current.get(threadId),
        );
        return Option.match(existing, {
          onNone: () =>
            Semaphore.make(1).pipe(
              Effect.map((semaphore) => {
                const next = new Map(current);
                next.set(threadId, semaphore);
                return [semaphore, next] as const;
              }),
            ),
          onSome: (semaphore) => Effect.succeed([semaphore, current] as const),
        });
      });

    const withThreadLock = <A, E, R>(threadId: string, effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(getThreadSemaphore(threadId), (semaphore) => semaphore.withPermit(effect));

    const logNative = (
      threadId: ThreadId,
      method: string,
      payload: unknown,
      _source: "acp.jsonrpc" | "acp.cursor.extension",
    ) =>
      Effect.gen(function* () {
        if (!nativeEventLogger) return;
        const observedAt = new Date().toISOString();
        yield* nativeEventLogger.write(
          {
            observedAt,
            event: {
              id: crypto.randomUUID(),
              kind: "notification",
              provider: PROVIDER,
              createdAt: observedAt,
              method,
              threadId,
              payload,
            },
          },
          threadId,
        );
      });

    const emitPlanUpdate = (
      ctx: CursorSessionContext,
      payload: {
        readonly explanation?: string | null;
        readonly plan: ReadonlyArray<{
          readonly step: string;
          readonly status: "pending" | "inProgress" | "completed";
        }>;
      },
      rawPayload: unknown,
      source: "acp.jsonrpc" | "acp.cursor.extension",
      method: string,
    ) =>
      Effect.gen(function* () {
        const fingerprint = `${ctx.activeTurnId ?? "no-turn"}:${JSON.stringify(payload)}`;
        if (ctx.lastPlanFingerprint === fingerprint) {
          return;
        }
        ctx.lastPlanFingerprint = fingerprint;
        yield* offerRuntimeEvent(
          makeAcpPlanUpdatedEvent({
            stamp: yield* makeEventStamp(),
            provider: PROVIDER,
            threadId: ctx.threadId,
            turnId: ctx.activeTurnId,
            payload,
            source,
            method,
            rawPayload,
          }),
        );
      });

    const requireSession = (
      threadId: ThreadId,
    ): Effect.Effect<CursorSessionContext, ProviderAdapterSessionNotFoundError> => {
      const ctx = sessions.get(threadId);
      if (!ctx || ctx.stopped) {
        return Effect.fail(
          new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }),
        );
      }
      return Effect.succeed(ctx);
    };

    const stopSessionInternal = (ctx: CursorSessionContext) =>
      Effect.gen(function* () {
        if (ctx.stopped) return;
        ctx.stopped = true;
        yield* settlePendingApprovalsAsCancelled(ctx.pendingApprovals);
        yield* settlePendingUserInputsAsEmptyAnswers(ctx.pendingUserInputs);
        if (ctx.notificationFiber) {
          yield* Fiber.interrupt(ctx.notificationFiber);
        }
        yield* Effect.ignore(Scope.close(ctx.scope, Exit.void));
        sessions.delete(ctx.threadId);
        yield* offerRuntimeEvent({
          type: "session.exited",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: ctx.threadId,
          payload: { exitKind: "graceful" },
        });
      });

    const startSession: CursorAdapterShape["startSession"] = (input) =>
      withThreadLock(
        input.threadId,
        Effect.gen(function* () {
          if (input.provider !== undefined && input.provider !== PROVIDER) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
            });
          }
          if (!input.cwd?.trim()) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: "cwd is required and must be non-empty.",
            });
          }

          const cwd = nodePath.resolve(input.cwd.trim());
          const cursorModelSelection =
            input.modelSelection?.provider === "cursor" ? input.modelSelection : undefined;
          const existing = sessions.get(input.threadId);
          if (existing && !existing.stopped) {
            yield* stopSessionInternal(existing);
          }

          const cursorSettings = yield* serverSettingsService.getSettings.pipe(
            Effect.map((settings) => settings.providers.cursor),
            Effect.mapError(
              (error) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: error.message,
                  cause: error,
                }),
            ),
          );

          const pendingApprovals = new Map<ApprovalRequestId, PendingApproval>();
          const pendingUserInputs = new Map<ApprovalRequestId, PendingUserInput>();
          const sessionScope = yield* Scope.make("sequential");
          let sessionScopeTransferred = false;
          yield* Effect.addFinalizer(() =>
            sessionScopeTransferred ? Effect.void : Scope.close(sessionScope, Exit.void),
          );
          let ctx!: CursorSessionContext;

          const resumeSessionId = parseCursorResume(input.resumeCursor)?.sessionId;
          const acpNativeLoggers = makeAcpNativeLoggers({
            nativeEventLogger,
            provider: PROVIDER,
            threadId: input.threadId,
          });

          const acp = yield* makeCursorAcpRuntime({
            cursorSettings,
            childProcessSpawner,
            cwd,
            ...(resumeSessionId ? { resumeSessionId } : {}),
            clientInfo: { name: "t3-code", version: "0.0.0" },
            ...acpNativeLoggers,
          }).pipe(
            Effect.provideService(Scope.Scope, sessionScope),
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: cause.message,
                  cause,
                }),
            ),
          );
          const started = yield* Effect.gen(function* () {
            yield* acp.handleExtRequest("cursor/ask_question", CursorAskQuestionRequest, (params) =>
              Effect.gen(function* () {
                yield* logNative(
                  input.threadId,
                  "cursor/ask_question",
                  params,
                  "acp.cursor.extension",
                );
                const requestId = ApprovalRequestId.make(crypto.randomUUID());
                const runtimeRequestId = RuntimeRequestId.make(requestId);
                const answers = yield* Deferred.make<ProviderUserInputAnswers>();
                pendingUserInputs.set(requestId, { answers });
                yield* offerRuntimeEvent({
                  type: "user-input.requested",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: resolveEffectiveTurnId(ctx),
                  requestId: runtimeRequestId,
                  payload: { questions: extractAskQuestions(params) },
                  raw: {
                    source: "acp.cursor.extension",
                    method: "cursor/ask_question",
                    payload: params,
                  },
                });
                const resolved = yield* Deferred.await(answers);
                pendingUserInputs.delete(requestId);
                yield* offerRuntimeEvent({
                  type: "user-input.resolved",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: resolveEffectiveTurnId(ctx),
                  requestId: runtimeRequestId,
                  payload: { answers: resolved },
                });
                return { answers: resolved };
              }),
            );
            yield* acp.handleExtRequest("cursor/create_plan", CursorCreatePlanRequest, (params) =>
              Effect.gen(function* () {
                yield* logNative(
                  input.threadId,
                  "cursor/create_plan",
                  params,
                  "acp.cursor.extension",
                );
                yield* offerRuntimeEvent({
                  type: "turn.proposed.completed",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: resolveEffectiveTurnId(ctx),
                  payload: { planMarkdown: extractPlanMarkdown(params) },
                  raw: {
                    source: "acp.cursor.extension",
                    method: "cursor/create_plan",
                    payload: params,
                  },
                });
                return { accepted: true } as const;
              }),
            );
            yield* acp.handleExtNotification(
              "cursor/update_todos",
              CursorUpdateTodosRequest,
              (params) =>
                Effect.gen(function* () {
                  yield* logNative(
                    input.threadId,
                    "cursor/update_todos",
                    params,
                    "acp.cursor.extension",
                  );
                  if (ctx) {
                    yield* emitPlanUpdate(
                      ctx,
                      extractTodosAsPlan(params),
                      params,
                      "acp.cursor.extension",
                      "cursor/update_todos",
                    );
                  }
                }),
            );
            yield* acp.handleExtNotification("cursor/task", CursorTaskNotification, (params) =>
              Effect.gen(function* () {
                yield* logNative(input.threadId, "cursor/task", params, "acp.cursor.extension");
                const taskId = RuntimeTaskId.make(params.toolCallId);
                const effectiveTurnId = resolveEffectiveTurnId(ctx);
                const description = params.description?.trim();
                const agentType = params.subagentType?.trim();
                const prompt = params.prompt ?? undefined;
                const model = params.model?.trim();
                const baseRawPayload = {
                  source: "acp.cursor.extension" as const,
                  method: "cursor/task" as const,
                  payload: params,
                };
                yield* offerRuntimeEvent({
                  type: "task.started",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: effectiveTurnId,
                  payload: {
                    taskId,
                    ...(description ? { description } : {}),
                    ...(agentType ? { agentType } : {}),
                    ...(params.toolCallId ? { toolUseId: params.toolCallId } : {}),
                    ...(prompt ? { prompt } : {}),
                    ...(model ? { model } : {}),
                  },
                  raw: baseRawPayload,
                });
                // Yield so the task.completed event gets a strictly later
                // createdAt timestamp — otherwise compareActivitiesByOrder
                // in session-logic can flake on same-millisecond ordering.
                yield* Effect.yieldNow;
                yield* offerRuntimeEvent({
                  type: "task.completed",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  threadId: input.threadId,
                  turnId: effectiveTurnId,
                  payload: {
                    taskId,
                    status: "completed",
                    ...(description ? { summary: description } : {}),
                  },
                  raw: baseRawPayload,
                });
              }),
            );
            yield* acp.handleCreateTerminal((request) =>
              Effect.gen(function* () {
                yield* logNative(input.threadId, "terminal/create", request, "acp.jsonrpc");
                if (!ctx) {
                  return yield* EffectAcpErrors.AcpRequestError.internalError(
                    "Cursor ACP session is not initialized",
                  );
                }
                const argsArray = request.args ? [...request.args] : [];
                const requestedCwd = request.cwd ?? cwd;
                const envVars: Record<string, string> | undefined = request.env
                  ? Object.fromEntries(request.env.map((entry) => [entry.name, entry.value]))
                  : undefined;
                const outputByteLimit =
                  typeof request.outputByteLimit === "number" ? request.outputByteLimit : undefined;

                const handle = yield* childProcessSpawner
                  .spawn(
                    ChildProcess.make(request.command, argsArray, {
                      cwd: requestedCwd,
                      ...(envVars ? { env: envVars, extendEnv: true } : {}),
                    }),
                  )
                  .pipe(
                    Effect.provideService(Scope.Scope, sessionScope),
                    Effect.mapError((cause) =>
                      EffectAcpErrors.AcpRequestError.internalError(
                        `Failed to spawn terminal command: ${cause.message}`,
                      ),
                    ),
                  );

                const terminalId = crypto.randomUUID();
                const exitDeferred = yield* Deferred.make<{
                  readonly exitCode: number | null;
                  readonly signal: string | null;
                }>();
                const entry: CursorTerminalEntry = {
                  command: formatShellCommand(request.command, argsArray),
                  args: argsArray,
                  cwd: requestedCwd,
                  outputByteLimit,
                  exitDeferred,
                  kill: handle.kill({ killSignal: "SIGTERM" }).pipe(Effect.ignore),
                  output: "",
                  released: false,
                  exited: false,
                };
                ctx.terminals.set(terminalId, entry);

                const decoder = new TextDecoder();
                const appendOutput = (chunk: Uint8Array) =>
                  Effect.sync(() => {
                    const text = decoder.decode(chunk, { stream: true });
                    if (text.length === 0) return;
                    entry.output = entry.output + text;
                    if (
                      entry.outputByteLimit !== undefined &&
                      entry.output.length > entry.outputByteLimit
                    ) {
                      entry.output = entry.output.slice(-entry.outputByteLimit);
                    }
                  });
                yield* Effect.forkIn(
                  Stream.runForEach(handle.stdout, appendOutput).pipe(Effect.ignore),
                  sessionScope,
                );
                yield* Effect.forkIn(
                  Stream.runForEach(handle.stderr, appendOutput).pipe(Effect.ignore),
                  sessionScope,
                );
                const markExited = Effect.sync(() => {
                  entry.exited = true;
                });
                const resolveExit = (exitCode: number | null) =>
                  markExited.pipe(
                    Effect.andThen(
                      Deferred.succeed(exitDeferred, { exitCode, signal: null }).pipe(
                        Effect.ignore,
                      ),
                    ),
                  );
                yield* Effect.forkIn(
                  handle.exitCode.pipe(
                    Effect.matchEffect({
                      onFailure: () => resolveExit(null),
                      onSuccess: (code) => resolveExit(Number(code)),
                    }),
                  ),
                  sessionScope,
                );

                return { terminalId };
              }),
            );
            yield* acp.handleTerminalOutput((request) =>
              Effect.gen(function* () {
                if (!ctx) {
                  return yield* EffectAcpErrors.AcpRequestError.internalError(
                    "Cursor ACP session is not initialized",
                  );
                }
                const entry = ctx.terminals.get(request.terminalId);
                if (!entry) {
                  return yield* EffectAcpErrors.AcpRequestError.resourceNotFound(
                    `Unknown terminal id: ${request.terminalId}`,
                  );
                }
                const isExited = Deferred.isDoneUnsafe(entry.exitDeferred);
                const exitStatus = isExited ? yield* Deferred.await(entry.exitDeferred) : undefined;
                return {
                  output: entry.output,
                  truncated:
                    entry.outputByteLimit !== undefined &&
                    entry.output.length >= entry.outputByteLimit,
                  ...(exitStatus
                    ? {
                        exitStatus: {
                          exitCode: exitStatus.exitCode,
                          signal: exitStatus.signal,
                        },
                      }
                    : {}),
                };
              }),
            );
            yield* acp.handleTerminalWaitForExit((request) =>
              Effect.gen(function* () {
                if (!ctx) {
                  return yield* EffectAcpErrors.AcpRequestError.internalError(
                    "Cursor ACP session is not initialized",
                  );
                }
                const entry = ctx.terminals.get(request.terminalId);
                if (!entry) {
                  return yield* EffectAcpErrors.AcpRequestError.resourceNotFound(
                    `Unknown terminal id: ${request.terminalId}`,
                  );
                }
                const status = yield* Deferred.await(entry.exitDeferred);
                return {
                  exitCode: status.exitCode,
                  signal: status.signal,
                };
              }),
            );
            yield* acp.handleTerminalKill((request) =>
              Effect.gen(function* () {
                if (!ctx) return;
                const entry = ctx.terminals.get(request.terminalId);
                if (!entry) return;
                yield* entry.kill;
              }),
            );
            yield* acp.handleTerminalRelease((request) =>
              Effect.gen(function* () {
                if (!ctx) return;
                const entry = ctx.terminals.get(request.terminalId);
                if (!entry) return;
                entry.released = true;
                if (entry.exited) {
                  ctx.terminals.delete(request.terminalId);
                }
              }),
            );
            yield* acp.handleRequestPermission((params) =>
              Effect.gen(function* () {
                yield* logNative(
                  input.threadId,
                  "session/request_permission",
                  params,
                  "acp.jsonrpc",
                );
                const permissionRequest = parsePermissionRequest(params);
                const hintToolCallId = params.toolCall.toolCallId.trim();
                if (ctx && hintToolCallId) {
                  const hint: { command?: string; title?: string } = {};
                  if (permissionRequest.toolCall?.command) {
                    hint.command = permissionRequest.toolCall.command;
                  }
                  const hintTitle = permissionRequest.toolCall?.title;
                  if (hintTitle && hintTitle.toLowerCase() !== "ran command") {
                    hint.title = hintTitle;
                  }
                  if (hint.command || hint.title) {
                    ctx.toolCallHints.set(hintToolCallId, hint);
                  }
                }
                if (input.runtimeMode === "full-access") {
                  const autoApprovedOptionId = selectAutoApprovedPermissionOption(params);
                  if (autoApprovedOptionId !== undefined) {
                    return {
                      outcome: {
                        outcome: "selected" as const,
                        optionId: autoApprovedOptionId,
                      },
                    };
                  }
                }
                const requestId = ApprovalRequestId.make(crypto.randomUUID());
                const runtimeRequestId = RuntimeRequestId.make(requestId);
                const decision = yield* Deferred.make<ProviderApprovalDecision>();
                pendingApprovals.set(requestId, {
                  decision,
                  kind: permissionRequest.kind,
                });
                yield* offerRuntimeEvent(
                  makeAcpRequestOpenedEvent({
                    stamp: yield* makeEventStamp(),
                    provider: PROVIDER,
                    threadId: input.threadId,
                    turnId: ctx?.activeTurnId,
                    requestId: runtimeRequestId,
                    permissionRequest,
                    detail: permissionRequest.detail ?? JSON.stringify(params).slice(0, 2000),
                    args: params,
                    source: "acp.jsonrpc",
                    method: "session/request_permission",
                    rawPayload: params,
                  }),
                );
                const resolved = yield* Deferred.await(decision);
                pendingApprovals.delete(requestId);
                yield* offerRuntimeEvent(
                  makeAcpRequestResolvedEvent({
                    stamp: yield* makeEventStamp(),
                    provider: PROVIDER,
                    threadId: input.threadId,
                    turnId: ctx?.activeTurnId,
                    requestId: runtimeRequestId,
                    permissionRequest,
                    decision: resolved,
                  }),
                );
                return {
                  outcome:
                    resolved === "cancel"
                      ? ({ outcome: "cancelled" } as const)
                      : {
                          outcome: "selected" as const,
                          optionId: acpPermissionOutcome(resolved),
                        },
                };
              }),
            );
            return yield* acp.start();
          }).pipe(
            Effect.mapError((error) =>
              mapAcpToAdapterError(PROVIDER, input.threadId, "session/start", error),
            ),
          );

          yield* applyRequestedSessionConfiguration({
            runtime: acp,
            runtimeMode: input.runtimeMode,
            interactionMode: undefined,
            modelSelection: cursorModelSelection,
            mapError: ({ cause, method }) =>
              mapAcpToAdapterError(PROVIDER, input.threadId, method, cause),
          });

          const now = yield* nowIso;
          const session: ProviderSession = {
            provider: PROVIDER,
            status: "ready",
            runtimeMode: input.runtimeMode,
            cwd,
            model: cursorModelSelection?.model,
            threadId: input.threadId,
            resumeCursor: {
              schemaVersion: CURSOR_RESUME_VERSION,
              sessionId: started.sessionId,
            },
            createdAt: now,
            updatedAt: now,
          };

          ctx = {
            threadId: input.threadId,
            session,
            scope: sessionScope,
            acp,
            notificationFiber: undefined,
            pendingApprovals,
            pendingUserInputs,
            turns: [],
            toolCallHints: new Map(),
            terminals: new Map(),
            activeSubagentTaskIds: new Set(),
            completedSubagentTaskIds: new Set(),
            lastPlanFingerprint: undefined,
            activeTurnId: undefined,
            stopped: false,
          };

          const nf = yield* Stream.runDrain(
            Stream.mapEffect(acp.getEvents(), (event) =>
              Effect.gen(function* () {
                switch (event._tag) {
                  case "ModeChanged":
                    return;
                  case "AssistantItemStarted":
                    yield* offerRuntimeEvent(
                      makeAcpAssistantItemEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: ctx.threadId,
                        turnId: ctx.activeTurnId,
                        itemId: event.itemId,
                        lifecycle: "item.started",
                      }),
                    );
                    return;
                  case "AssistantItemCompleted":
                    yield* offerRuntimeEvent(
                      makeAcpAssistantItemEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: ctx.threadId,
                        turnId: ctx.activeTurnId,
                        itemId: event.itemId,
                        lifecycle: "item.completed",
                      }),
                    );
                    return;
                  case "PlanUpdated":
                    yield* logNative(
                      ctx.threadId,
                      "session/update",
                      event.rawPayload,
                      "acp.jsonrpc",
                    );
                    yield* emitPlanUpdate(
                      ctx,
                      event.payload,
                      event.rawPayload,
                      "acp.jsonrpc",
                      "session/update",
                    );
                    return;
                  case "ToolCallUpdated":
                    yield* logNative(
                      ctx.threadId,
                      "session/update",
                      event.rawPayload,
                      "acp.jsonrpc",
                    );
                    const toolCall = applyToolCallHint(
                      event.toolCall,
                      resolveTerminalHintFromToolCall(event.toolCall, ctx.terminals) ??
                        ctx.toolCallHints.get(event.toolCall.toolCallId),
                    );
                    if (isCursorSubagentToolCall(toolCall)) {
                      const taskId = cursorSubagentTaskId(ctx.activeTurnId);
                      if (taskId && !ctx.activeSubagentTaskIds.has(taskId)) {
                        ctx.activeSubagentTaskIds.add(taskId);
                        yield* offerRuntimeEvent({
                          type: "task.started",
                          ...(yield* makeEventStamp()),
                          provider: PROVIDER,
                          threadId: ctx.threadId,
                          turnId: ctx.activeTurnId,
                          payload: {
                            taskId: RuntimeTaskId.make(taskId),
                            taskType: "subagent",
                            description: "Cursor subagent",
                          },
                          raw: {
                            source: "acp.jsonrpc",
                            method: "session/update",
                            payload: event.rawPayload,
                          },
                        });
                      }
                      if (taskId) {
                        yield* offerRuntimeEvent({
                          type: "task.progress",
                          ...(yield* makeEventStamp()),
                          provider: PROVIDER,
                          threadId: ctx.threadId,
                          turnId: ctx.activeTurnId,
                          payload: {
                            taskId: RuntimeTaskId.make(taskId),
                            description: cursorSubagentProgressDescription(toolCall),
                            ...(toolCall.kind ? { lastToolName: toolCall.kind } : {}),
                          },
                          raw: {
                            source: "acp.jsonrpc",
                            method: "session/update",
                            payload: event.rawPayload,
                          },
                        });
                      }
                    }
                    yield* offerRuntimeEvent(
                      makeAcpToolCallEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: ctx.threadId,
                        turnId: ctx.activeTurnId,
                        toolCall,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                  case "ContentDelta":
                    yield* logNative(
                      ctx.threadId,
                      "session/update",
                      event.rawPayload,
                      "acp.jsonrpc",
                    );
                    yield* offerRuntimeEvent(
                      makeAcpContentDeltaEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: ctx.threadId,
                        turnId: ctx.activeTurnId,
                        ...(event.itemId ? { itemId: event.itemId } : {}),
                        text: event.text,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                }
              }),
            ),
          ).pipe(Effect.forkChild);

          ctx.notificationFiber = nf;
          sessions.set(input.threadId, ctx);
          sessionScopeTransferred = true;

          yield* offerRuntimeEvent({
            type: "session.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { resume: started.initializeResult },
          });
          yield* offerRuntimeEvent({
            type: "session.state.changed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { state: "ready", reason: "Cursor ACP session ready" },
          });
          yield* offerRuntimeEvent({
            type: "thread.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { providerThreadId: started.sessionId },
          });

          return session;
        }).pipe(Effect.scoped),
      );

    const sendTurn: CursorAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(input.threadId);
        const turnId = TurnId.make(crypto.randomUUID());
        const turnModelSelection =
          input.modelSelection?.provider === "cursor" ? input.modelSelection : undefined;
        const model = turnModelSelection?.model ?? ctx.session.model;
        const resolvedModel = resolveCursorAcpBaseModelId(model);
        yield* applyRequestedSessionConfiguration({
          runtime: ctx.acp,
          runtimeMode: ctx.session.runtimeMode,
          interactionMode: input.interactionMode,
          modelSelection:
            model === undefined
              ? undefined
              : {
                  model,
                  options: turnModelSelection?.options,
                },
          mapError: ({ cause, method }) =>
            mapAcpToAdapterError(PROVIDER, input.threadId, method, cause),
        });
        ctx.activeTurnId = turnId;
        ctx.lastPlanFingerprint = undefined;
        ctx.session = {
          ...ctx.session,
          activeTurnId: turnId,
          updatedAt: yield* nowIso,
        };

        yield* offerRuntimeEvent({
          type: "turn.started",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: input.threadId,
          turnId,
          payload: { model: resolvedModel },
        });

        const promptParts: Array<EffectAcpSchema.ContentBlock> = [];
        if (input.input?.trim()) {
          promptParts.push({ type: "text", text: input.input.trim() });
        }
        if (input.attachments && input.attachments.length > 0) {
          for (const attachment of input.attachments) {
            const attachmentPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment,
            });
            if (!attachmentPath) {
              return yield* new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "session/prompt",
                detail: `Invalid attachment id '${attachment.id}'.`,
              });
            }
            const bytes = yield* fileSystem.readFile(attachmentPath).pipe(
              Effect.mapError(
                (cause) =>
                  new ProviderAdapterRequestError({
                    provider: PROVIDER,
                    method: "session/prompt",
                    detail: cause.message,
                    cause,
                  }),
              ),
            );
            promptParts.push({
              type: "image",
              data: Buffer.from(bytes).toString("base64"),
              mimeType: attachment.mimeType,
            });
          }
        }

        if (promptParts.length === 0) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: "Turn requires non-empty text or attachments.",
          });
        }

        const result = yield* ctx.acp
          .prompt({
            prompt: promptParts,
          })
          .pipe(
            Effect.mapError((error) =>
              mapAcpToAdapterError(PROVIDER, input.threadId, "session/prompt", error),
            ),
          );

        ctx.turns.push({ id: turnId, items: [{ prompt: promptParts, result }] });
        ctx.session = {
          ...ctx.session,
          activeTurnId: turnId,
          updatedAt: yield* nowIso,
          model: resolvedModel,
        };

        const subagentTaskId = cursorSubagentTaskId(turnId);
        if (
          subagentTaskId &&
          ctx.activeSubagentTaskIds.has(subagentTaskId) &&
          !ctx.completedSubagentTaskIds.has(subagentTaskId)
        ) {
          ctx.completedSubagentTaskIds.add(subagentTaskId);
          yield* offerRuntimeEvent({
            type: "task.completed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            payload: {
              taskId: RuntimeTaskId.make(subagentTaskId),
              status: result.stopReason === "cancelled" ? "stopped" : "completed",
            },
          });
        }

        yield* offerRuntimeEvent({
          type: "turn.completed",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: input.threadId,
          turnId,
          payload: {
            state: result.stopReason === "cancelled" ? "cancelled" : "completed",
            stopReason: result.stopReason ?? null,
          },
        });

        return {
          threadId: input.threadId,
          turnId,
          resumeCursor: ctx.session.resumeCursor,
        };
      });

    const interruptTurn: CursorAdapterShape["interruptTurn"] = (threadId) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        yield* settlePendingApprovalsAsCancelled(ctx.pendingApprovals);
        yield* settlePendingUserInputsAsEmptyAnswers(ctx.pendingUserInputs);
        yield* Effect.ignore(
          ctx.acp.cancel.pipe(
            Effect.mapError((error) =>
              mapAcpToAdapterError(PROVIDER, threadId, "session/cancel", error),
            ),
          ),
        );
      });

    const respondToRequest: CursorAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        const pending = ctx.pendingApprovals.get(requestId);
        if (!pending) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "session/request_permission",
            detail: `Unknown pending approval request: ${requestId}`,
          });
        }
        yield* Deferred.succeed(pending.decision, decision);
      });

    const respondToUserInput: CursorAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      answers,
    ) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        const pending = ctx.pendingUserInputs.get(requestId);
        if (!pending) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "cursor/ask_question",
            detail: `Unknown pending user-input request: ${requestId}`,
          });
        }
        yield* Deferred.succeed(pending.answers, answers);
      });

    const readThread: CursorAdapterShape["readThread"] = (threadId) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        return { threadId, turns: ctx.turns };
      });

    const rollbackThread: CursorAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        if (!Number.isInteger(numTurns) || numTurns < 1) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be an integer >= 1.",
          });
        }
        const nextLength = Math.max(0, ctx.turns.length - numTurns);
        ctx.turns.splice(nextLength);
        return { threadId, turns: ctx.turns };
      });

    const stopSession: CursorAdapterShape["stopSession"] = (threadId) =>
      withThreadLock(
        threadId,
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          yield* stopSessionInternal(ctx);
        }),
      );

    const listSessions: CursorAdapterShape["listSessions"] = () =>
      Effect.sync(() => Array.from(sessions.values(), (c) => ({ ...c.session })));

    const hasSession: CursorAdapterShape["hasSession"] = (threadId) =>
      Effect.sync(() => {
        const c = sessions.get(threadId);
        return c !== undefined && !c.stopped;
      });

    const stopAll: CursorAdapterShape["stopAll"] = () =>
      Effect.forEach(sessions.values(), stopSessionInternal, { discard: true });

    yield* Effect.addFinalizer(() =>
      Effect.forEach(sessions.values(), stopSessionInternal, { discard: true }).pipe(
        Effect.tap(() => PubSub.shutdown(runtimeEventPubSub)),
        Effect.tap(() => managedNativeEventLogger?.close() ?? Effect.void),
      ),
    );

    const streamEvents = Stream.fromPubSub(runtimeEventPubSub);

    return {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },
      startSession,
      sendTurn,
      interruptTurn,
      readThread,
      rollbackThread,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      stopAll,
      streamEvents,
    } satisfies CursorAdapterShape;
  });
}

export const CursorAdapterLive = Layer.effect(CursorAdapter, makeCursorAdapter());

export function makeCursorAdapterLive(opts?: CursorAdapterLiveOptions) {
  return Layer.effect(CursorAdapter, makeCursorAdapter(opts));
}
