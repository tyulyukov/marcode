import type { JiraAttachmentRef, JiraIssue } from "@marcode/contracts";

export interface JiraTaskDraft {
  readonly id: string;
  readonly issueKey: string;
  readonly summary: string;
  readonly status: string;
  readonly issueType: string;
  readonly priority: string | undefined;
  readonly assignee: string | undefined;
  readonly description: string | undefined;
  readonly url: string;
  readonly attachments: ReadonlyArray<JiraAttachmentRef>;
}

export const INLINE_JIRA_CONTEXT_PLACEHOLDER = "\uFFFD";

const TRAILING_JIRA_CONTEXT_BLOCK_PATTERN = /\n*<jira_context>\n([\s\S]*?)\n<\/jira_context>\s*$/;

const JIRA_TASK_SEPARATOR_PATTERN = /\n<!-- jira-task-separator -->\n/;
const JIRA_TASK_SEPARATOR_LITERAL = "<!-- jira-task-separator -->";

const JIRA_URL_PATTERN = /https?:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i;

const JIRA_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;

export function parseJiraUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(JIRA_URL_PATTERN);
  if (!match?.[1]) return null;
  if (match[0] !== trimmed) return null;
  return match[1];
}

export function isJiraIssueKeyPattern(query: string): boolean {
  return /^[A-Z]{2,}-\d*/i.test(query);
}

export function isValidJiraIssueKey(key: string): boolean {
  return JIRA_ISSUE_KEY_PATTERN.test(key);
}

export function jiraIssueToTaskDraft(issue: JiraIssue): JiraTaskDraft {
  return {
    id: `jira-${issue.key}`,
    issueKey: issue.key,
    summary: issue.summary,
    status: issue.status,
    issueType: issue.issueType,
    priority: issue.priority,
    assignee: issue.assignee?.displayName,
    description: issue.description,
    url: issue.url,
    attachments: issue.attachments,
  };
}

export function formatJiraTaskLabel(task: JiraTaskDraft): string {
  return `${task.issueKey}: ${task.summary}`;
}

export function formatJiraTaskInlineLabel(task: JiraTaskDraft): string {
  return `@jira:${task.issueKey}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatSingleTaskContext(task: JiraTaskDraft): string {
  const lines: string[] = [];
  lines.push(`[${task.issueKey}] ${task.summary}`);

  const meta: string[] = [];
  meta.push(`Status: ${task.status}`);
  if (task.priority) meta.push(`Priority: ${task.priority}`);
  if (task.assignee) meta.push(`Assignee: ${task.assignee}`);
  meta.push(`Type: ${task.issueType}`);
  lines.push(meta.join(" | "));

  if (task.url) {
    lines.push(`URL: ${task.url}`);
  }

  if (task.description && task.description.trim().length > 0) {
    lines.push("");
    lines.push("Description:");
    lines.push(task.description.trim());
  }

  if (task.attachments.length > 0) {
    lines.push("");
    lines.push("Attachments:");
    for (const att of task.attachments) {
      lines.push(`  - ${att.filename} (${att.mimeType}, ${formatBytes(att.size)})`);
    }
  }

  return lines.join("\n");
}

export function buildJiraContextBlock(tasks: ReadonlyArray<JiraTaskDraft>): string {
  if (tasks.length === 0) return "";
  const body = tasks.map(formatSingleTaskContext).join(`\n\n${JIRA_TASK_SEPARATOR_LITERAL}\n\n`);
  return `\n<jira_context>\n${body}\n</jira_context>`;
}

export function appendJiraContextsToPrompt(
  promptText: string,
  tasks: ReadonlyArray<JiraTaskDraft>,
): string {
  if (tasks.length === 0) return promptText;
  return promptText + buildJiraContextBlock(tasks);
}

export interface ParsedJiraContextEntry {
  readonly header: string;
  readonly body: string;
}

export interface ExtractedJiraContexts {
  readonly promptText: string;
  readonly contextCount: number;
  readonly contexts: ParsedJiraContextEntry[];
}

export function extractTrailingJiraContexts(text: string): ExtractedJiraContexts {
  const match = text.match(TRAILING_JIRA_CONTEXT_BLOCK_PATTERN);
  if (!match) {
    return { promptText: text, contextCount: 0, contexts: [] };
  }

  const rawBody = match[1] ?? "";
  const promptText = text.slice(0, match.index ?? 0).trimEnd();

  const taskBlocks = rawBody
    .split(JIRA_TASK_SEPARATOR_PATTERN)
    .filter((block) => block.trim().length > 0);
  const contexts: ParsedJiraContextEntry[] = taskBlocks.map((block) => {
    const trimmed = block.trim();
    const firstNewline = trimmed.indexOf("\n");
    const header = firstNewline >= 0 ? trimmed.slice(0, firstNewline) : trimmed;
    const body = firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : "";
    return { header, body };
  });

  return { promptText, contextCount: contexts.length, contexts };
}

export function stripInlineJiraContextPlaceholders(prompt: string): string {
  return prompt.replaceAll(INLINE_JIRA_CONTEXT_PLACEHOLDER, "");
}

export function removeInlineJiraContextPlaceholder(
  prompt: string,
  contextIndex: number,
): { prompt: string; cursor: number } {
  if (contextIndex < 0) {
    return { prompt, cursor: prompt.length };
  }

  let placeholderIndex = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_JIRA_CONTEXT_PLACEHOLDER) {
      continue;
    }
    if (placeholderIndex === contextIndex) {
      const before = prompt.slice(0, index);
      const after = prompt.slice(index + 1);
      return { prompt: before + after, cursor: before.length };
    }
    placeholderIndex += 1;
  }

  return { prompt, cursor: prompt.length };
}

export function jiraTaskDedupKey(task: JiraTaskDraft): string {
  return task.issueKey.toUpperCase();
}

const HEADER_KEY_PATTERN = /^\[([A-Z][A-Z0-9]+-\d+)\]/i;

/**
 * Extract issue keys from parsed Jira context entries (`[KEY] summary` headers).
 */
export function jiraIssueKeysFromContexts(
  contexts: ReadonlyArray<ParsedJiraContextEntry>,
): ReadonlyArray<string> {
  const keys: string[] = [];
  for (const context of contexts) {
    const match = context.header.match(HEADER_KEY_PATTERN);
    if (match?.[1]) {
      keys.push(match[1].toUpperCase());
    }
  }
  return keys;
}

/**
 * Lightweight server-side ticket context derived from a parsed `<jira_context>` block.
 *
 * Mirrors the relevant bits of `JiraTaskDraft` minus attachments — used by the
 * auxiliary text generators (commit/PR/branch/title) to inform their prompts.
 */
export interface JiraTicketContext {
  readonly issueKey: string;
  readonly summary: string;
  readonly status: string;
  readonly issueType: string;
  readonly priority: string | undefined;
  readonly assignee: string | undefined;
  readonly description: string | undefined;
  readonly url: string | undefined;
}

const JIRA_HEADER_PATTERN = /^\[([A-Z][A-Z0-9]+-\d+)\]\s+(.+)$/i;

interface ParseEntryOptions {
  readonly maxDescriptionChars?: number;
}

const DESCRIPTION_LABEL = "Description:";
const ATTACHMENTS_LABEL = "Attachments:";

/**
 * Parse a `ParsedJiraContextEntry` (header + body) back into structured fields.
 * Best-effort: any field we can't parse is left undefined.
 */
export function parseJiraContextEntry(
  entry: ParsedJiraContextEntry,
  options: ParseEntryOptions = {},
): JiraTicketContext | null {
  const headerMatch = entry.header.match(JIRA_HEADER_PATTERN);
  if (!headerMatch?.[1] || !headerMatch[2]) return null;

  const issueKey = headerMatch[1].toUpperCase();
  const summary = headerMatch[2].trim();

  const lines = entry.body.split("\n");
  let status = "";
  let issueType = "";
  let priority: string | undefined;
  let assignee: string | undefined;
  let url: string | undefined;
  let description: string | undefined;

  let inDescription = false;
  let inAttachments = false;
  const descriptionLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      if (inDescription) descriptionLines.push("");
      continue;
    }

    if (line === DESCRIPTION_LABEL) {
      inDescription = true;
      inAttachments = false;
      continue;
    }

    if (line === ATTACHMENTS_LABEL) {
      inDescription = false;
      inAttachments = true;
      continue;
    }

    if (inAttachments) {
      continue;
    }

    if (inDescription) {
      descriptionLines.push(rawLine);
      continue;
    }

    if (line.startsWith("URL: ")) {
      url = line.slice("URL: ".length).trim();
      continue;
    }

    if (line.includes(" | ") || line.startsWith("Status:")) {
      const parts = line.split(" | ");
      for (const part of parts) {
        const colonIndex = part.indexOf(":");
        if (colonIndex < 0) continue;
        const key = part.slice(0, colonIndex).trim();
        const value = part.slice(colonIndex + 1).trim();
        if (key === "Status") status = value;
        else if (key === "Priority") priority = value;
        else if (key === "Assignee") assignee = value;
        else if (key === "Type") issueType = value;
      }
      continue;
    }
  }

  if (descriptionLines.length > 0) {
    let joined = descriptionLines.join("\n").trim();
    const maxChars = options.maxDescriptionChars;
    if (typeof maxChars === "number" && maxChars > 0 && joined.length > maxChars) {
      joined = `${joined.slice(0, maxChars).trimEnd()}…`;
    }
    if (joined.length > 0) description = joined;
  }

  return {
    issueKey,
    summary,
    status,
    issueType,
    priority,
    assignee,
    description,
    url,
  };
}
