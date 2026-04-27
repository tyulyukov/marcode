import { CommandId, type OrchestrationSessionStatus } from "@marcode/contracts";
import { Effect } from "effect";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";

const ORPHAN_STATUSES = new Set<OrchestrationSessionStatus>(["starting", "running"]);

const RECOVERY_LAST_ERROR =
  "Provider session was lost when the server restarted. Send a new message to resume.";

const orphanRecoveryCommandId = (): CommandId =>
  CommandId.make(`server:startup-orphan-recovery:${crypto.randomUUID()}`);

export const recoverOrphanedProviderSessionsAtStartup = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const readModel = yield* orchestrationEngine.getReadModel();
  const now = new Date().toISOString();

  let recoveredCount = 0;

  for (const thread of readModel.threads) {
    const session = thread.session;
    if (!session) continue;
    if (!ORPHAN_STATUSES.has(session.status)) continue;

    yield* orchestrationEngine
      .dispatch({
        type: "thread.session.set",
        commandId: orphanRecoveryCommandId(),
        threadId: thread.id,
        session: {
          ...session,
          status: "interrupted",
          activeTurnId: null,
          lastError: RECOVERY_LAST_ERROR,
          compacting: false,
          updatedAt: now,
        },
        createdAt: now,
      })
      .pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            recoveredCount += 1;
          }),
        ),
        Effect.catchCause((cause) =>
          Effect.logWarning("provider.session.startup-recovery.dispatch-failed", {
            threadId: thread.id,
            previousStatus: session.status,
            previousActiveTurnId: session.activeTurnId,
            cause,
          }),
        ),
      );
  }

  if (recoveredCount > 0) {
    yield* Effect.logInfo("provider.session.startup-recovery.complete", {
      recoveredCount,
    });
  }
});
