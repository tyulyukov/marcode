/**
 * Shared prompt builders for text generation providers.
 *
 * Extracts the prompt construction logic that is identical across
 * Codex, Claude, and any future CLI-based text generation backends.
 *
 * @module textGenerationPrompts
 */
import { Schema } from "effect";
import type { ChatAttachment } from "@marcode/contracts";
import type { JiraTicketContext } from "@marcode/shared/jiraContext";

import { limitSection } from "./Utils.ts";

// ---------------------------------------------------------------------------
// Jira section helpers (shared across all prompt builders)
// ---------------------------------------------------------------------------

const COMMIT_JIRA_CONTEXT_RULE =
  "These Jira tickets are listed for CONTEXT only. Use the ticket summary / description to inform the 'why' in the commit body — write user-visible motivation in your own words drawing on the ticket context. Do NOT include the ticket key anywhere in the commit subject or body. No `Refs:` trailer, no `[KEY]` prefix, no parenthesized suffix. The commit message must read naturally on its own without any explicit ticket reference.";

const PR_TITLE_REQUIRED_RULE =
  "The PR title MUST include the implemented ticket key(s). You decide where to place it — bracketed prefix `[PROJECT-111] feat(scope): description`, parenthesized suffix `feat(scope): description (PROJECT-111)`, or interpolated `feat(PROJECT-111): description` — pick whichever reads best. For multiple implemented tickets, include each key in the title (e.g. `[PROJECT-111] [PROJECT-222] feat: …` or `feat: … (PROJECT-111, PROJECT-222)`). The key absolutely must be visible in the title; this is non-negotiable.";

const PR_BODY_RULE =
  "Use the Jira ticket summary / description to inform the 'why' inside the existing `## Summary` section — explain the user-visible motivation in your own words drawing on the ticket context. Do NOT add a `## Tickets` heading, a `Refs:` trailer, or any other sidecar block listing the tickets. The ticket key already appears in the title; the body's job is to explain the change.";

const COMMIT_PR_JIRA_FILTER_RULE_TITLE =
  "These Jira tickets were referenced during the conversation. Include a ticket key in the title ONLY if the diff visibly implements that ticket. If a ticket is purely contextual, unrelated, or you can't tell, omit it from the title.";

const BRANCH_RULE =
  "If one or more tickets are implemented by this change, include their keys in the branch name. For multiple keys, join them with `-`, e.g. `PROJECT-111-add-login` or `PROJECT-111-PROJECT-222-add-login`. If no ticket is implemented, produce the branch name without a key. Do not include any prefix like `feature/` or `marcode/` — the caller adds those.";

const BRANCH_FILTER_RULE_NO_DIFF =
  "Tickets referenced by the user follow. The user usually mentions a ticket because they intend to work on it — include 1-2 of the most relevant keys in the branch name. If unsure, prefer the first listed.";

const BRANCH_FILTER_RULE_WITH_DIFF =
  "These Jira tickets were referenced during the conversation. Include a ticket key in the branch name ONLY if the diff visibly implements that ticket. If unsure, omit the keys.";

interface JiraSectionOptions {
  /** Maximum description characters per ticket. */
  readonly perTicketDescriptionChars?: number;
  /** Maximum total Jira section length (after assembly). */
  readonly totalSectionLimit?: number;
  /** Caller-controlled filter rule (varies between commit/PR/branch w/ diff vs. branch w/o diff). */
  readonly filterRule: string;
}

const DEFAULT_PER_TICKET_DESCRIPTION_CHARS = 1_000;
const DEFAULT_TOTAL_SECTION_LIMIT = 8_000;

function formatTicketForPrompt(
  ticket: JiraTicketContext,
  perTicketDescriptionChars: number,
): string {
  const lines: string[] = [];
  lines.push(`[${ticket.issueKey}] ${ticket.summary}`);

  const meta: string[] = [];
  if (ticket.status) meta.push(`Status: ${ticket.status}`);
  if (ticket.priority) meta.push(`Priority: ${ticket.priority}`);
  if (ticket.assignee) meta.push(`Assignee: ${ticket.assignee}`);
  if (ticket.issueType) meta.push(`Type: ${ticket.issueType}`);
  if (meta.length > 0) lines.push(meta.join(" | "));

  if (ticket.url) lines.push(`URL: ${ticket.url}`);

  if (ticket.description && ticket.description.trim().length > 0) {
    let desc = ticket.description.trim();
    if (desc.length > perTicketDescriptionChars) {
      desc = `${desc.slice(0, perTicketDescriptionChars).trimEnd()}…`;
    }
    lines.push("Description:");
    lines.push(desc);
  }

  return lines.join("\n");
}

/**
 * Build the `Jira tickets:` section appended to commit/PR/branch prompts.
 *
 * Returns an empty string when `tickets` is empty so callers can splice it in
 * without checking length themselves.
 */
function buildJiraSection(
  tickets: ReadonlyArray<JiraTicketContext> | undefined,
  options: JiraSectionOptions,
): string {
  if (!tickets || tickets.length === 0) return "";

  const perTicketDescriptionChars =
    options.perTicketDescriptionChars ?? DEFAULT_PER_TICKET_DESCRIPTION_CHARS;
  const totalSectionLimit = options.totalSectionLimit ?? DEFAULT_TOTAL_SECTION_LIMIT;

  const ticketBlocks = tickets
    .map((ticket) => formatTicketForPrompt(ticket, perTicketDescriptionChars))
    .join("\n\n");

  const section = ["", "Jira tickets:", options.filterRule, "", ticketBlocks].join("\n");

  return limitSection(section, totalSectionLimit);
}

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

export interface CommitMessagePromptInput {
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch: boolean;
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

const COMMIT_PER_TICKET_DESCRIPTION_CHARS = 600;
const COMMIT_TOTAL_SECTION_LIMIT = 6_000;

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch;

  const jiraSection = buildJiraSection(input.jiraTickets, {
    filterRule: COMMIT_JIRA_CONTEXT_RULE,
    perTicketDescriptionChars: COMMIT_PER_TICKET_DESCRIPTION_CHARS,
    totalSectionLimit: COMMIT_TOTAL_SECTION_LIMIT,
  });
  const hasJira = jiraSection.length > 0;

  const sections: string[] = [
    "You write concise git commit messages following the Conventional Commits specification.",
    "Produce a subject (commit subject line) and body (commit body text).",
    "Rules:",
    "- subject MUST follow the Conventional Commits format: <type>(<optional scope>): <description>",
    "- allowed types: feat, fix, refactor, perf, test, docs, style, build, ci, chore, revert",
    "- scope is optional but encouraged — use a noun describing the affected area (e.g. feat(auth):, fix(ws):)",
    "- description must be lowercase, imperative mood, <= 72 chars total, no trailing period",
    "- for breaking changes, append ! before the colon (e.g. feat(api)!: remove deprecated endpoint)",
    "- body can be empty string or short bullet points",
    ...(wantsBranch
      ? ["- branch must be a short semantic git branch fragment for this change"]
      : []),
    "- capture the primary user-visible or developer-visible change",
    ...(hasJira ? [`- ${COMMIT_JIRA_CONTEXT_RULE}`] : []),
    ...(hasJira && wantsBranch ? [`- ${BRANCH_RULE}`] : []),
    "",
    `Branch: ${input.branch ?? "(detached)"}`,
    "",
    "Staged files:",
    limitSection(input.stagedSummary, 6_000),
    "",
    "Staged patch:",
    limitSection(input.stagedPatch, 40_000),
  ];

  if (hasJira) sections.push(jiraSection);

  const prompt = sections.join("\n");

  if (wantsBranch) {
    return {
      prompt,
      outputSchema: Schema.Struct({
        subject: Schema.String,
        body: Schema.String,
        branch: Schema.String,
      }),
    };
  }

  return {
    prompt,
    outputSchema: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
  };
}

// ---------------------------------------------------------------------------
// PR content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

const PR_PER_TICKET_DESCRIPTION_CHARS = 1_000;
const PR_TOTAL_SECTION_LIMIT = 8_000;

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const jiraSection = buildJiraSection(input.jiraTickets, {
    filterRule: COMMIT_PR_JIRA_FILTER_RULE_TITLE,
    perTicketDescriptionChars: PR_PER_TICKET_DESCRIPTION_CHARS,
    totalSectionLimit: PR_TOTAL_SECTION_LIMIT,
  });
  const hasJira = jiraSection.length > 0;

  const sections: string[] = [
    "You write GitHub pull request content following the Conventional Commits specification.",
    "Produce a title (PR title) and body (PR description in markdown). Do NOT actually create the pull request.",
    "Rules:",
    "- title MUST follow the Conventional Commits format: <type>(<optional scope>): <description>",
    "- allowed types: feat, fix, refactor, perf, test, docs, style, build, ci, chore, revert",
    "- scope is optional but encouraged — use a noun describing the affected area",
    "- title description must be lowercase, concise, and specific",
    "- for breaking changes, append ! before the colon (e.g. feat(api)!: remove deprecated endpoint)",
    "- body must be markdown and include headings '## Summary' and '## Testing'",
    "- under Summary, provide short bullet points",
    "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
    ...(hasJira ? [`- ${PR_TITLE_REQUIRED_RULE}`, `- ${PR_BODY_RULE}`] : []),
    "",
    `Base branch: ${input.baseBranch}`,
    `Head branch: ${input.headBranch}`,
    "",
    "Commits:",
    limitSection(input.commitSummary, 12_000),
    "",
    "Diff stat:",
    limitSection(input.diffSummary, 12_000),
    "",
    "Diff patch:",
    limitSection(input.diffPatch, 40_000),
  ];

  if (hasJira) sections.push(jiraSection);

  const prompt = sections.join("\n");

  const outputSchema = Schema.Struct({
    title: Schema.String,
    body: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

export interface BranchNamePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

interface PromptFromMessageInput {
  instruction: string;
  responseShape: string;
  rules: ReadonlyArray<string>;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  jiraSection?: string;
}

function buildPromptFromMessage(input: PromptFromMessageInput): string {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const promptSections = [
    input.instruction,
    input.responseShape,
    "Rules:",
    ...input.rules.map((rule) => `- ${rule}`),
    "",
    "User message:",
    limitSection(input.message, 8_000),
  ];
  if (attachmentLines.length > 0) {
    promptSections.push(
      "",
      "Attachment metadata:",
      limitSection(attachmentLines.join("\n"), 4_000),
    );
  }

  if (input.jiraSection && input.jiraSection.length > 0) {
    promptSections.push(input.jiraSection);
  }

  return promptSections.join("\n");
}

const BRANCH_PER_TICKET_DESCRIPTION_CHARS = 400;
const BRANCH_TOTAL_SECTION_LIMIT = 3_000;
const BRANCH_TICKET_LIMIT = 2;

export function buildBranchNamePrompt(input: BranchNamePromptInput) {
  const limitedTickets = input.jiraTickets?.slice(0, BRANCH_TICKET_LIMIT);
  const jiraSection = buildJiraSection(limitedTickets, {
    filterRule: BRANCH_FILTER_RULE_NO_DIFF,
    perTicketDescriptionChars: BRANCH_PER_TICKET_DESCRIPTION_CHARS,
    totalSectionLimit: BRANCH_TOTAL_SECTION_LIMIT,
  });
  const hasJira = jiraSection.length > 0;

  const baseRules: string[] = [
    "Branch should describe the requested work from the user message.",
    "Keep it short and specific (2-6 words).",
    hasJira
      ? "Use plain words. Punctuation-heavy text is not allowed; the only structural element you may add is one or more Jira ticket keys (see rule below)."
      : "Use plain words only, no issue prefixes and no punctuation-heavy text.",
    "If images are attached, use them as primary context for visual/UI issues.",
  ];

  if (hasJira) {
    baseRules.push(BRANCH_RULE);
  }

  const prompt = buildPromptFromMessage({
    instruction: "You generate concise git branch names.",
    responseShape: "Respond with the branch name only.",
    rules: baseRules,
    message: input.message,
    attachments: input.attachments,
    jiraSection,
  });
  const outputSchema = Schema.Struct({
    branch: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Thread title
// ---------------------------------------------------------------------------

const THREAD_TITLE_PER_TICKET_DESCRIPTION_CHARS = 300;
const THREAD_TITLE_TOTAL_SECTION_LIMIT = 1_500;
const THREAD_TITLE_TICKET_LIMIT = 1;
const THREAD_TITLE_FILTER_RULE =
  'A Jira ticket referenced by the user follows. If the ticket clearly captures the work intent, you MAY include the key in the title (e.g. "PROJECT-111: Add login" or "Add login (PROJECT-111)"). Otherwise, ignore the ticket.';

export interface ThreadTitlePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const limitedTickets = input.jiraTickets?.slice(0, THREAD_TITLE_TICKET_LIMIT);
  const jiraSection = buildJiraSection(limitedTickets, {
    filterRule: THREAD_TITLE_FILTER_RULE,
    perTicketDescriptionChars: THREAD_TITLE_PER_TICKET_DESCRIPTION_CHARS,
    totalSectionLimit: THREAD_TITLE_TOTAL_SECTION_LIMIT,
  });

  const prompt = buildPromptFromMessage({
    instruction: "You generate concise thread titles for coding assistant conversations.",
    responseShape: "Respond with the title only.",
    rules: [
      "Title should summarize the user's coding intent or task.",
      "Keep it short and specific (3-8 words).",
      "Use sentence case (capitalize first word only, unless proper nouns).",
      "Do not include quotation marks or trailing punctuation.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    jiraSection,
  });
  const outputSchema = Schema.Struct({
    title: Schema.String,
  });

  return { prompt, outputSchema };
}

// Re-exported so callers (e.g. ProviderCommandReactor) that bypass the
// `Jira tickets` builder can still build a section directly with the
// "no-diff" filter wording when they have only the user message at hand.
export const branchNoDiffJiraFilterRule = BRANCH_FILTER_RULE_NO_DIFF;
export const branchWithDiffJiraFilterRule = BRANCH_FILTER_RULE_WITH_DIFF;

// ---------------------------------------------------------------------------
// Implementing-Jira-tickets classifier
// ---------------------------------------------------------------------------

export interface ClassifyImplementingJiraTicketsPromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  jiraTickets: ReadonlyArray<JiraTicketContext>;
}

const CLASSIFIER_PER_TICKET_DESCRIPTION_CHARS = 800;
const CLASSIFIER_TOTAL_SECTION_LIMIT = 10_000;

export function buildClassifyImplementingJiraTicketsPrompt(
  input: ClassifyImplementingJiraTicketsPromptInput,
) {
  const allKeys = input.jiraTickets.map((ticket) => ticket.issueKey);

  const ticketsBlock = input.jiraTickets
    .map((ticket) => formatTicketForPrompt(ticket, CLASSIFIER_PER_TICKET_DESCRIPTION_CHARS))
    .join("\n\n");

  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const sections: string[] = [
    "You classify Jira tickets by user intent.",
    "",
    "Given the user's message and a list of Jira tickets they referenced, identify which tickets the user is actively asking the agent to IMPLEMENT in this work.",
    "",
    "Rules:",
    "- A ticket is implementing if the user wants the agent to do its work now: 'implement X', 'fix the bug from X', 'do what X describes'.",
    "- A ticket is reference-only if the user mentions it for context, comparison, prior art, or background: 'see Y for context', 'similar to how we did Y', 'related to Y', 'fix this the same way we fixed Y'.",
    "- A SINGLE ticket can also be reference-only — never assume the lone mentioned ticket is implementing without checking the wording. If the user clearly describes work that does NOT match the ticket's scope (e.g. asks for unrelated changes and only links the ticket as a pattern to follow), exclude it.",
    "- When the message is ambiguous, default to EXCLUDING the ticket. It is better to omit a key from the branch / commit / PR than to engrave a reference ticket the user never intended to implement.",
    "- It is OK — and expected — to return an empty list when no ticket is being implemented.",
    "- Respond with the keys EXACTLY as written in the input (case-preserving). Do not invent new keys.",
    "",
    `Allowed keys: ${allKeys.join(", ")}`,
    "",
    "User message:",
    limitSection(input.message, 8_000),
  ];

  if (attachmentLines.length > 0) {
    sections.push("", "Attachment metadata:", limitSection(attachmentLines.join("\n"), 4_000));
  }

  sections.push("", "Jira tickets:", limitSection(ticketsBlock, CLASSIFIER_TOTAL_SECTION_LIMIT));

  const prompt = sections.join("\n");

  const outputSchema = Schema.Struct({
    implementingKeys: Schema.Array(Schema.String),
  });

  return { prompt, outputSchema };
}
