import {
  EnvironmentId,
  MessageId,
  type ModelSelection,
  ProjectId,
  ThreadId,
} from "@marcode/contracts";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ChatMessage,
  type Thread,
  type ThreadSession,
} from "../types";
import {
  canCreateThreadHandoff,
  resolveAvailableHandoffTargetProviders,
  resolveThreadHandoffModelSelection,
} from "./threadHandoff";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: EnvironmentId.make("environment-local"),
    codexThreadId: null,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { provider: "claudeAgent", model: "claude-opus-4-6" },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-02-13T00:00:00.000Z",
    archivedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    associatedWorktreePath: null,
    associatedWorktreeBranch: null,
    associatedWorktreeRef: null,
    createBranchFlowCompleted: false,
    handoff: null,
    additionalDirectories: [],
    implementingJiraTicketKeys: [],
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: MessageId.make(`message-${Math.random().toString(36).slice(2, 10)}`),
    role: "user",
    text: "hello",
    source: "native",
    createdAt: "2026-02-13T00:01:00.000Z",
    streaming: false,
    ...overrides,
  };
}

describe("threadHandoff", () => {
  it("lists all supported handoff targets except the active provider", () => {
    expect(resolveAvailableHandoffTargetProviders("codex")).toEqual([
      "claudeAgent",
      "cursor",
      "opencode",
    ]);
    expect(resolveAvailableHandoffTargetProviders("claudeAgent")).toEqual([
      "codex",
      "cursor",
      "opencode",
    ]);
    expect(resolveAvailableHandoffTargetProviders("cursor")).toEqual([
      "codex",
      "claudeAgent",
      "opencode",
    ]);
    expect(resolveAvailableHandoffTargetProviders("opencode")).toEqual([
      "codex",
      "claudeAgent",
      "cursor",
    ]);
  });

  it("prefers sticky model selection for the chosen handoff target", () => {
    const stickySelection = {
      provider: "codex",
      model: "gpt-5.4",
    } satisfies ModelSelection;

    expect(
      resolveThreadHandoffModelSelection({
        sourceThread: {
          modelSelection: { provider: "claudeAgent", model: "claude-sonnet-4-6" },
        },
        targetProvider: "codex",
        projectDefaultModelSelection: { provider: "codex", model: "gpt-5.3-codex" },
        stickyModelSelectionByProvider: { codex: stickySelection },
      }),
    ).toEqual(stickySelection);
  });

  it("falls back to the project default model selection when no sticky exists for the target", () => {
    const projectDefault = {
      provider: "cursor",
      model: "composer-1.5",
    } satisfies ModelSelection;

    expect(
      resolveThreadHandoffModelSelection({
        sourceThread: {
          modelSelection: { provider: "codex", model: "gpt-5.4" },
        },
        targetProvider: "cursor",
        projectDefaultModelSelection: projectDefault,
        stickyModelSelectionByProvider: {},
      }),
    ).toEqual(projectDefault);
  });

  it("falls back to the resolved provider default model when no sticky or project default exists", () => {
    expect(
      resolveThreadHandoffModelSelection({
        sourceThread: {
          modelSelection: { provider: "claudeAgent", model: "claude-opus-4-6" },
        },
        targetProvider: "codex",
        projectDefaultModelSelection: null,
        stickyModelSelectionByProvider: {},
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
    });
  });

  describe("canCreateThreadHandoff", () => {
    it("returns false when isBusy", () => {
      const thread = makeThread({ messages: [makeMessage()] });
      expect(canCreateThreadHandoff({ thread, isBusy: true })).toBe(false);
    });

    it("returns false when hasPendingApprovals", () => {
      const thread = makeThread({ messages: [makeMessage()] });
      expect(canCreateThreadHandoff({ thread, hasPendingApprovals: true })).toBe(false);
    });

    it("returns false when hasPendingUserInput", () => {
      const thread = makeThread({ messages: [makeMessage()] });
      expect(canCreateThreadHandoff({ thread, hasPendingUserInput: true })).toBe(false);
    });

    it("returns false when the source thread has a handoff and no native messages", () => {
      const thread = makeThread({
        handoff: {
          sourceThreadId: ThreadId.make("thread-source"),
          sourceProvider: "codex",
          importedAt: "2026-02-13T00:00:00.000Z",
          bootstrapStatus: "pending",
        },
        messages: [makeMessage({ source: "handoff-import" })],
      });
      expect(canCreateThreadHandoff({ thread })).toBe(false);
    });

    it("returns true when the source thread has a handoff but also has native messages", () => {
      const thread = makeThread({
        handoff: {
          sourceThreadId: ThreadId.make("thread-source"),
          sourceProvider: "codex",
          importedAt: "2026-02-13T00:00:00.000Z",
          bootstrapStatus: "pending",
        },
        messages: [
          makeMessage({ source: "handoff-import" }),
          makeMessage({ role: "user", source: "native" }),
        ],
      });
      expect(canCreateThreadHandoff({ thread })).toBe(true);
    });

    it("returns false when there are no importable messages", () => {
      const thread = makeThread({ messages: [] });
      expect(canCreateThreadHandoff({ thread })).toBe(false);
    });

    it("returns false when the orchestration session is running", () => {
      const session: ThreadSession = {
        provider: "claudeAgent",
        status: "running",
        createdAt: "2026-02-13T00:00:00.000Z",
        updatedAt: "2026-02-13T00:00:00.000Z",
        orchestrationStatus: "running",
        compacting: false,
      };
      const thread = makeThread({ messages: [makeMessage()], session });
      expect(canCreateThreadHandoff({ thread })).toBe(false);
    });

    it("returns true for an idle thread with native importable messages and no handoff", () => {
      const thread = makeThread({ messages: [makeMessage()] });
      expect(canCreateThreadHandoff({ thread })).toBe(true);
    });
  });
});
