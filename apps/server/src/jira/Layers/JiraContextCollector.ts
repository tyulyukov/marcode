/**
 * JiraContextCollectorLive - Live implementation backed by `OrchestrationEngine`.
 *
 * Reads the in-memory orchestration read model, finds the thread, and walks
 * its user messages via `collectThreadJiraContexts`. Wraps the whole pipeline
 * in `Effect.catchAll` so any failure short-circuits to `[]`.
 *
 * @module JiraContextCollectorLive
 */
import { Effect, Layer } from "effect";
import type { ThreadId } from "@marcode/contracts";
import type { JiraTicketContext } from "@marcode/shared/jiraContext";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import {
  JiraContextCollector,
  type JiraContextCollectorOptions,
  type JiraContextCollectorShape,
} from "../Services/JiraContextCollector.ts";
import { collectThreadJiraContexts } from "../threadJiraContext.ts";

export const JiraContextCollectorLive = Layer.effect(
  JiraContextCollector,
  Effect.gen(function* () {
    const orchestrationEngine = yield* OrchestrationEngineService;

    const forThread: JiraContextCollectorShape["forThread"] = (
      threadId: ThreadId,
      options?: JiraContextCollectorOptions,
    ) =>
      Effect.gen(function* () {
        const readModel = yield* orchestrationEngine.getReadModel();
        const thread = readModel.threads.find((t) => t.id === threadId);
        if (!thread) return [] as ReadonlyArray<JiraTicketContext>;
        const allMentioned = collectThreadJiraContexts(thread, options);
        if (thread.implementingJiraTicketKeys.length === 0) {
          // Classification hasn't completed (or this is a pre-classification
          // thread). Fall back to passing every mentioned ticket — the prompt
          // rule already instructs the model to filter by diff.
          return allMentioned;
        }
        const allowed = new Set(thread.implementingJiraTicketKeys.map((k) => k.toUpperCase()));
        return allMentioned.filter((ticket) => allowed.has(ticket.issueKey.toUpperCase()));
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("JiraContextCollector failed; degrading to empty list", {
            threadId,
            cause,
          }).pipe(Effect.as([] as ReadonlyArray<JiraTicketContext>)),
        ),
      );

    return { forThread } satisfies JiraContextCollectorShape;
  }),
);
