/**
 * Thread → Jira-context aggregation.
 *
 * Walks user messages on an `OrchestrationThread`, parses the trailing
 * `<jira_context>...</jira_context>` block each message carries (when the user
 * @jira-mentioned tickets via the composer), dedups by issue key, trims
 * descriptions for token budget, and returns the resulting `JiraTicketContext`
 * list ready to be fed into a prompt builder.
 *
 * @module threadJiraContext
 */
import type { OrchestrationThread } from "@marcode/contracts";
import {
  extractTrailingJiraContexts,
  parseJiraContextEntry,
  type JiraTicketContext,
} from "@marcode/shared/jiraContext";

export interface CollectThreadJiraContextOptions {
  /** Maximum tickets to return after dedup. Default: 5. */
  readonly maxTickets?: number;
  /** Maximum description characters per ticket. Default: 1_000. */
  readonly maxDescriptionChars?: number;
}

const DEFAULT_MAX_TICKETS = 5;
const DEFAULT_MAX_DESCRIPTION_CHARS = 1_000;

export function collectThreadJiraContexts(
  thread: Pick<OrchestrationThread, "messages">,
  options: CollectThreadJiraContextOptions = {},
): ReadonlyArray<JiraTicketContext> {
  const maxTickets = options.maxTickets ?? DEFAULT_MAX_TICKETS;
  const maxDescriptionChars = options.maxDescriptionChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;

  const seen = new Map<string, JiraTicketContext>();

  for (const message of thread.messages) {
    if (message.role !== "user") continue;
    if (typeof message.text !== "string" || message.text.length === 0) continue;

    const extracted = extractTrailingJiraContexts(message.text);
    if (extracted.contextCount === 0) continue;

    for (const entry of extracted.contexts) {
      const parsed = parseJiraContextEntry(entry, { maxDescriptionChars });
      if (!parsed) continue;
      if (seen.has(parsed.issueKey)) continue;
      seen.set(parsed.issueKey, parsed);
      if (seen.size >= maxTickets) break;
    }

    if (seen.size >= maxTickets) break;
  }

  return Array.from(seen.values());
}
