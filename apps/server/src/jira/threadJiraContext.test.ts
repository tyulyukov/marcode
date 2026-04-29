import { describe, expect, it } from "vitest";

import { buildJiraContextBlock, type JiraTaskDraft } from "@marcode/shared/jiraContext";

import { collectThreadJiraContexts } from "./threadJiraContext.ts";

const ASSISTANT_MESSAGE_NOISE = "let me look at this";

function makeTask(overrides: Partial<JiraTaskDraft> & { issueKey: string }): JiraTaskDraft {
  return {
    id: `jira-${overrides.issueKey}`,
    summary: "Add login flow",
    status: "In Progress",
    issueType: "Task",
    priority: "High",
    assignee: "Maks",
    description: "Users can't log in.",
    url: `https://example.atlassian.net/browse/${overrides.issueKey}`,
    attachments: [],
    ...overrides,
  };
}

function userMessage(text: string, id = `m-${Math.random()}`) {
  return {
    id: id as unknown as string,
    role: "user" as const,
    text,
  };
}

function assistantMessage(text: string, id = `m-a-${Math.random()}`) {
  return {
    id: id as unknown as string,
    role: "assistant" as const,
    text,
  };
}

describe("collectThreadJiraContexts", () => {
  it("returns an empty list when the thread has no user messages or no <jira_context> blocks", () => {
    const empty = collectThreadJiraContexts({ messages: [] });
    expect(empty).toEqual([]);

    const noJira = collectThreadJiraContexts({
      messages: [
        userMessage("hey can you implement this"),
        assistantMessage(ASSISTANT_MESSAGE_NOISE),
      ],
    } as never);
    expect(noJira).toEqual([]);
  });

  it("extracts a single ticket from a user message's trailing <jira_context>", () => {
    const block = buildJiraContextBlock([makeTask({ issueKey: "PROJECT-111" })]);
    const messageText = `Implement login per the spec.${block}`;

    const result = collectThreadJiraContexts({ messages: [userMessage(messageText)] } as never);

    expect(result).toHaveLength(1);
    expect(result[0]?.issueKey).toBe("PROJECT-111");
    expect(result[0]?.summary).toBe("Add login flow");
    expect(result[0]?.status).toBe("In Progress");
    expect(result[0]?.priority).toBe("High");
    expect(result[0]?.assignee).toBe("Maks");
    expect(result[0]?.url).toBe("https://example.atlassian.net/browse/PROJECT-111");
    expect(result[0]?.description).toContain("Users can't log in");
  });

  it("dedups by uppercased issue key across messages", () => {
    const block1 = buildJiraContextBlock([makeTask({ issueKey: "proj-42", summary: "first ref" })]);
    const block2 = buildJiraContextBlock([
      makeTask({ issueKey: "PROJ-42", summary: "second ref same ticket" }),
      makeTask({ issueKey: "OPS-9", summary: "second ticket" }),
    ]);

    const result = collectThreadJiraContexts({
      messages: [
        userMessage(`first message${block1}`),
        assistantMessage(ASSISTANT_MESSAGE_NOISE),
        userMessage(`second message${block2}`),
      ],
    } as never);

    expect(result.map((t) => t.issueKey)).toEqual(["PROJ-42", "OPS-9"]);
    // First occurrence wins for the duplicated key.
    expect(result[0]?.summary).toBe("first ref");
  });

  it("ignores assistant messages even when they contain a <jira_context> block", () => {
    const block = buildJiraContextBlock([makeTask({ issueKey: "PROJECT-111" })]);
    const result = collectThreadJiraContexts({
      messages: [assistantMessage(`echoed back: ${block}`)],
    } as never);

    expect(result).toEqual([]);
  });

  it("trims long descriptions to the configured budget", () => {
    const longDescription = "a".repeat(5_000);
    const block = buildJiraContextBlock([
      makeTask({ issueKey: "PROJECT-111", description: longDescription }),
    ]);

    const result = collectThreadJiraContexts({ messages: [userMessage(`work${block}`)] } as never, {
      maxDescriptionChars: 100,
    });

    expect(result[0]?.description).toBeDefined();
    expect((result[0]?.description ?? "").length).toBeLessThanOrEqual(101);
  });

  it("caps the number of unique tickets at maxTickets", () => {
    const tasks = ["AA-1", "BB-2", "CC-3", "DD-4", "EE-5", "FF-6"].map((k) =>
      makeTask({ issueKey: k }),
    );
    const messages = tasks.map((task) => userMessage(`work\n${buildJiraContextBlock([task])}`));

    const result = collectThreadJiraContexts({ messages } as never, { maxTickets: 3 });

    expect(result.map((t) => t.issueKey)).toEqual(["AA-1", "BB-2", "CC-3"]);
  });
});
