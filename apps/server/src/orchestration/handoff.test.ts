import { describe, expect, it } from "vitest";
import type { OrchestrationMessage, OrchestrationThread } from "@marcode/contracts";

import {
  buildHandoffBootstrapText,
  hasNativeAssistantMessagesBefore,
  hasNativeHandoffMessages,
  listImportedHandoffMessages,
} from "./handoff.ts";

const isoNow = "2026-05-08T00:00:00.000Z";

const message = (
  overrides: Partial<OrchestrationMessage> & Pick<OrchestrationMessage, "id" | "role" | "text">,
): OrchestrationMessage =>
  ({
    turnId: null,
    streaming: false,
    source: "native",
    createdAt: isoNow,
    updatedAt: isoNow,
    ...overrides,
  }) as OrchestrationMessage;

const baseThread: Pick<
  OrchestrationThread,
  "title" | "branch" | "worktreePath" | "handoff" | "messages"
> = {
  title: "Original" as OrchestrationThread["title"],
  branch: null,
  worktreePath: null,
  handoff: {
    sourceThreadId: "thread-A" as OrchestrationThread["handoff"] extends infer T
      ? T extends null
        ? never
        : T extends { sourceThreadId: infer S }
          ? S
          : never
      : never,
    sourceProvider: "codex",
    importedAt: isoNow as OrchestrationThread["createdAt"],
    bootstrapStatus: "pending",
  } as OrchestrationThread["handoff"],
  messages: [],
};

describe("buildHandoffBootstrapText", () => {
  it("returns null when there are no imported messages", () => {
    expect(buildHandoffBootstrapText({ ...baseThread, messages: [] })).toBeNull();
  });

  it("returns null when handoff is null", () => {
    const imported = message({
      id: "msg-1" as OrchestrationMessage["id"],
      role: "user",
      text: "hi",
      source: "handoff-import",
    });
    expect(
      buildHandoffBootstrapText({ ...baseThread, handoff: null, messages: [imported] }),
    ).toBeNull();
  });

  it("includes intro, title, and most recent imported messages", () => {
    const imported = message({
      id: "msg-1" as OrchestrationMessage["id"],
      role: "user",
      text: "hello world",
      source: "handoff-import",
    });
    const text = buildHandoffBootstrapText({ ...baseThread, messages: [imported] });
    expect(text).not.toBeNull();
    expect(text).toContain("This conversation was handed off from codex.");
    expect(text).toContain("Original conversation title: Original");
    expect(text).toContain("Most recent imported messages:");
    expect(text).toContain("hello world");
  });

  it("includes branch + worktree path when set", () => {
    const imported = message({
      id: "msg-1" as OrchestrationMessage["id"],
      role: "user",
      text: "hi",
      source: "handoff-import",
    });
    const text = buildHandoffBootstrapText({
      ...baseThread,
      branch: "feature/x" as OrchestrationThread["branch"],
      worktreePath: "/tmp/wt" as OrchestrationThread["worktreePath"],
      messages: [imported],
    });
    expect(text).toContain("Git branch: feature/x");
    expect(text).toContain("Worktree path: /tmp/wt");
  });

  it("emits an Earlier conversation summary section when more than RECENT_MESSAGE_COUNT messages", () => {
    const imported = Array.from({ length: 10 }, (_, i) =>
      message({
        id: `msg-${i}` as OrchestrationMessage["id"],
        role: i % 2 === 0 ? "user" : "assistant",
        text: `body-${i}`,
        source: "handoff-import",
      }),
    );
    const text = buildHandoffBootstrapText({ ...baseThread, messages: imported });
    expect(text).toContain("Earlier conversation summary:");
    expect(text).toContain("body-0");
    expect(text).toContain("body-9");
  });

  it("respects the maxChars budget by trimming with ellipsis", () => {
    const imported = message({
      id: "msg-1" as OrchestrationMessage["id"],
      role: "user",
      text: "x".repeat(1_000),
      source: "handoff-import",
    });
    const text = buildHandoffBootstrapText({ ...baseThread, messages: [imported] }, 100);
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(100);
    expect(text!.endsWith("...")).toBe(true);
  });
});

describe("listImportedHandoffMessages", () => {
  it("filters to user/assistant non-streaming handoff-import messages", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-native" as OrchestrationMessage["id"],
        role: "user",
        text: "n",
        source: "native",
      }),
      message({
        id: "msg-imported" as OrchestrationMessage["id"],
        role: "user",
        text: "i",
        source: "handoff-import",
      }),
      message({
        id: "msg-streaming" as OrchestrationMessage["id"],
        role: "assistant",
        text: "s",
        source: "handoff-import",
        streaming: true,
      }),
      message({
        id: "msg-system" as OrchestrationMessage["id"],
        role: "system",
        text: "sys",
        source: "handoff-import",
      }),
    ];
    const result = listImportedHandoffMessages({ messages });
    expect(result.map((m) => m.id)).toEqual(["msg-imported"]);
  });
});

describe("hasNativeHandoffMessages", () => {
  it("returns true if there is at least one native, non-streaming user/assistant message", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-imported" as OrchestrationMessage["id"],
        role: "user",
        text: "i",
        source: "handoff-import",
      }),
      message({
        id: "msg-native" as OrchestrationMessage["id"],
        role: "user",
        text: "n",
        source: "native",
      }),
    ];
    expect(hasNativeHandoffMessages({ messages })).toBe(true);
  });

  it("returns false when only handoff-import messages exist", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-imported" as OrchestrationMessage["id"],
        role: "user",
        text: "i",
        source: "handoff-import",
      }),
    ];
    expect(hasNativeHandoffMessages({ messages })).toBe(false);
  });
});

describe("hasNativeAssistantMessagesBefore", () => {
  it("returns false when the current message is the first one", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-1" as OrchestrationMessage["id"],
        role: "user",
        text: "hi",
        source: "native",
      }),
    ];
    expect(hasNativeAssistantMessagesBefore({ messages }, "msg-1")).toBe(false);
  });

  it("returns true when a prior message is a native assistant", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-a" as OrchestrationMessage["id"],
        role: "user",
        text: "hi",
        source: "native",
      }),
      message({
        id: "msg-b" as OrchestrationMessage["id"],
        role: "assistant",
        text: "ok",
        source: "native",
      }),
      message({
        id: "msg-c" as OrchestrationMessage["id"],
        role: "user",
        text: "more",
        source: "native",
      }),
    ];
    expect(hasNativeAssistantMessagesBefore({ messages }, "msg-c")).toBe(true);
  });

  it("returns false when prior assistants are all imported", () => {
    const messages: OrchestrationMessage[] = [
      message({
        id: "msg-a" as OrchestrationMessage["id"],
        role: "assistant",
        text: "ok",
        source: "handoff-import",
      }),
      message({
        id: "msg-b" as OrchestrationMessage["id"],
        role: "user",
        text: "next",
        source: "native",
      }),
    ];
    expect(hasNativeAssistantMessagesBefore({ messages }, "msg-b")).toBe(false);
  });
});
