import { describe, expect, it } from "vitest";
import {
  parseJiraUrl,
  isJiraIssueKeyPattern,
  isValidJiraIssueKey,
  jiraIssueToTaskDraft,
  formatJiraTaskLabel,
  formatJiraTaskInlineLabel,
  jiraTaskDedupKey,
  buildJiraContextBlock,
  extractTrailingJiraContexts,
  stripInlineJiraContextPlaceholders,
  INLINE_JIRA_CONTEXT_PLACEHOLDER,
} from "./jiraContext";
import type { JiraIssue } from "@marcode/contracts";

function makeMockJiraIssue(overrides?: Partial<JiraIssue>): JiraIssue {
  return {
    key: "PROJ-123" as JiraIssue["key"],
    summary: "Fix login bug" as JiraIssue["summary"],
    status: "In Progress" as JiraIssue["status"],
    issueType: "Bug" as JiraIssue["issueType"],
    priority: "High" as JiraIssue["priority"],
    assignee: {
      accountId: "abc123" as JiraIssue["assignee"] extends { accountId: infer T } | undefined
        ? T
        : never,
      displayName: "Jane Doe" as JiraIssue["assignee"] extends { displayName: infer T } | undefined
        ? T
        : never,
    },
    description: "Users cannot log in with SSO",
    labels: [],
    attachments: [],
    url: "https://myorg.atlassian.net/browse/PROJ-123" as JiraIssue["url"],
    createdAt: "2026-01-01T00:00:00Z" as JiraIssue["createdAt"],
    updatedAt: "2026-01-02T00:00:00Z" as JiraIssue["updatedAt"],
    ...overrides,
  } as JiraIssue;
}

describe("jiraContext", () => {
  it("parseJiraUrl extracts key from valid Atlassian URL", () => {
    expect(parseJiraUrl("https://myorg.atlassian.net/browse/PROJ-123")).toBe("PROJ-123");
  });

  it("parseJiraUrl returns null for non-Jira URLs", () => {
    expect(parseJiraUrl("https://example.com/browse/PROJ-123")).toBeNull();
    expect(parseJiraUrl("not a url")).toBeNull();
  });

  it("isJiraIssueKeyPattern matches PROJ-123", () => {
    expect(isJiraIssueKeyPattern("PROJ-123")).toBe(true);
  });

  it("isJiraIssueKeyPattern matches partial AB- for autocomplete", () => {
    expect(isJiraIssueKeyPattern("AB-")).toBe(true);
  });

  it("isValidJiraIssueKey accepts PROJ-123 and rejects proj- without digits", () => {
    expect(isValidJiraIssueKey("PROJ-123")).toBe(true);
    expect(isValidJiraIssueKey("proj-")).toBe(false);
  });

  it("jiraIssueToTaskDraft maps all fields correctly", () => {
    const issue = makeMockJiraIssue();
    const draft = jiraIssueToTaskDraft(issue);

    expect(draft.id).toBe("jira-PROJ-123");
    expect(draft.issueKey).toBe("PROJ-123");
    expect(draft.summary).toBe("Fix login bug");
    expect(draft.status).toBe("In Progress");
    expect(draft.issueType).toBe("Bug");
    expect(draft.priority).toBe("High");
    expect(draft.assignee).toBe("Jane Doe");
    expect(draft.description).toBe("Users cannot log in with SSO");
    expect(draft.url).toBe("https://myorg.atlassian.net/browse/PROJ-123");
    expect(draft.attachments).toEqual([]);
  });

  it("formatJiraTaskLabel returns KEY: Summary", () => {
    const draft = jiraIssueToTaskDraft(makeMockJiraIssue());
    expect(formatJiraTaskLabel(draft)).toBe("PROJ-123: Fix login bug");
  });

  it("formatJiraTaskInlineLabel returns @jira:KEY", () => {
    const draft = jiraIssueToTaskDraft(makeMockJiraIssue());
    expect(formatJiraTaskInlineLabel(draft)).toBe("@jira:PROJ-123");
  });

  it("parseJiraUrl trims whitespace around URLs", () => {
    expect(parseJiraUrl("  https://myorg.atlassian.net/browse/PROJ-456  ")).toBe("PROJ-456");
  });

  it("parseJiraUrl rejects URLs with query params or extra path segments", () => {
    expect(parseJiraUrl("https://myorg.atlassian.net/browse/PROJ-123?foo=bar")).toBeNull();
    expect(parseJiraUrl("https://myorg.atlassian.net/browse/PROJ-123/extra")).toBeNull();
  });

  it("parseJiraUrl rejects text containing a URL among other content", () => {
    expect(parseJiraUrl("check https://myorg.atlassian.net/browse/PROJ-123 out")).toBeNull();
  });

  it("extractTrailingJiraContexts strips trailing context block from prompt", () => {
    const prompt =
      "hello @jira:PROJ-123\n<jira_context>\n[PROJ-123] Fix bug\nStatus: Open\n</jira_context>";
    const result = extractTrailingJiraContexts(prompt);
    expect(result.promptText).toBe("hello @jira:PROJ-123");
    expect(result.contextCount).toBe(1);
    expect(result.contexts[0]?.header).toBe("[PROJ-123] Fix bug");
  });

  it("stripInlineJiraContextPlaceholders removes all placeholder chars", () => {
    const input = `hello${INLINE_JIRA_CONTEXT_PLACEHOLDER}world${INLINE_JIRA_CONTEXT_PLACEHOLDER}`;
    expect(stripInlineJiraContextPlaceholders(input)).toBe("helloworld");
  });

  it("buildJiraContextBlock formats multiple tasks with separator", () => {
    const task1 = jiraIssueToTaskDraft(makeMockJiraIssue());
    const task2 = jiraIssueToTaskDraft(
      makeMockJiraIssue({
        key: "PROJ-456" as JiraIssue["key"],
        summary: "Another bug" as JiraIssue["summary"],
      }),
    );
    const block = buildJiraContextBlock([task1, task2]);
    expect(block).toContain("<jira_context>");
    expect(block).toContain("</jira_context>");
    expect(block).toContain("[PROJ-123]");
    expect(block).toContain("[PROJ-456]");
    expect(block).toContain("<!-- jira-task-separator -->");
  });

  it("jiraTaskDedupKey uppercases issue key for dedup", () => {
    const draft = jiraIssueToTaskDraft(makeMockJiraIssue());
    expect(jiraTaskDedupKey(draft)).toBe("PROJ-123");
  });
});
