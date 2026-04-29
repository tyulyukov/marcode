/**
 * JiraContextCollector - Effect service contract for thread-scoped Jira context.
 *
 * Resolves the `JiraTicketContext` list referenced inside a thread's messages
 * (via `@jira:` composer mentions, serialized into `<jira_context>` blocks).
 * Used by auxiliary text generators (commit, PR content, branch name, thread
 * title) so their prompts can engrave the ticket key + draw "why" detail from
 * the description.
 *
 * Semantics:
 * - Always returns a list. On any failure (read-model unavailable, parse
 *   error, OAuth-expired Jira upstream — though no API call happens here) the
 *   service degrades silently to `[]`. Never blocks a commit/PR action.
 *
 * @module JiraContextCollector
 */
import { Context } from "effect";
import type { Effect } from "effect";
import type { ThreadId } from "@marcode/contracts";
import type { JiraTicketContext } from "@marcode/shared/jiraContext";

export interface JiraContextCollectorOptions {
  readonly maxTickets?: number;
  readonly maxDescriptionChars?: number;
}

export interface JiraContextCollectorShape {
  /**
   * Resolve Jira ticket contexts referenced in the given thread's messages.
   *
   * Errors are caught internally and converted to an empty list — callers
   * never need to handle failures.
   */
  readonly forThread: (
    threadId: ThreadId,
    options?: JiraContextCollectorOptions,
  ) => Effect.Effect<ReadonlyArray<JiraTicketContext>, never>;
}

/**
 * JiraContextCollector - Service tag for thread-scoped Jira context resolution.
 */
export class JiraContextCollector extends Context.Service<
  JiraContextCollector,
  JiraContextCollectorShape
>()("marcode/jira/JiraContextCollector") {}
