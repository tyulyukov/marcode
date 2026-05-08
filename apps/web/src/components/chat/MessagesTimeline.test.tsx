import { MessageId } from "@marcode/contracts";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LegendListRef } from "@legendapp/list/react";

vi.mock("@legendapp/list/react", async () => {
  const React = await import("react");

  const LegendList = React.forwardRef(function MockLegendList(
    props: {
      data: Array<{ id: string }>;
      keyExtractor: (item: { id: string }) => string;
      renderItem: (args: { item: { id: string } }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
    },
    _ref: React.ForwardedRef<LegendListRef>,
  ) {
    return (
      <div data-testid="legend-list">
        {props.ListHeaderComponent}
        {props.data.map((item) => (
          <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
        ))}
        {props.ListFooterComponent}
      </div>
    );
  });

  return { LegendList };
});

function matchMedia() {
  return {
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

beforeAll(() => {
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
  vi.stubGlobal("window", {
    matchMedia,
    addEventListener: () => {},
    removeEventListener: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList,
      offsetHeight: 0,
      style: {
        setProperty: () => {},
        removeProperty: () => {},
      },
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

const ACTIVE_THREAD_ENVIRONMENT_ID = "environment-local" as never;

describe("MessagesTimeline", () => {
  it("renders inline terminal labels with the composer chip UI", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        provider="claudeAgent"
        threadId="test-thread"
        hasMessages
        isHydrating={false}
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        listRef={listRef}
        onIsAtEndChange={() => {}}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "message",
            createdAt: "2026-03-17T19:12:28.000Z",
            message: {
              id: MessageId.make("message-2"),
              role: "user",
              text: [
                "yoo what's @terminal-1:1-5 mean",
                "",
                "<terminal_context>",
                "- Terminal 1 lines 1-5:",
                "  1 | julius@mac effect-http-ws-cli % bun i",
                "  2 | bun install v1.3.9 (cf6cdbbb)",
                "</terminal_context>",
              ].join("\n"),
              createdAt: "2026-03-17T19:12:28.000Z",
              streaming: false,
              source: "native",
            },
          },
        ]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        changedFilesExpandedByTurnId={{}}
        onSetChangedFilesExpanded={() => {}}
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={ACTIVE_THREAD_ENVIRONMENT_ID}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        isSendBusy={false}
        isSessionStarting={false}
        hasPendingAssistantResponse={false}
        isPreparingWorktree={false}
        isCompacting={false}
        onSubagentSelect={() => {}}
        editingUserMessageId={null}
        editingUserMessageText=""
        editingUserMessageImages={[]}
        onStartEditUserMessage={() => {}}
        onChangeEditingUserMessageText={() => {}}
        onAddEditingUserMessageImages={() => {}}
        onRemoveEditingUserMessageImage={() => {}}
        onCancelEditUserMessage={() => {}}
        onSubmitEditUserMessage={() => {}}
        onReplyToSelection={() => {}}
      />,
    );

    expect(markup).toContain("Terminal 1 lines 1-5");
    expect(markup).toContain("lucide-terminal");
    expect(markup).toContain("yoo what&#x27;s ");
  }, 10_000);

  it("renders a plan-update card with delta sections when a work entry carries plan deltas", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        provider="claudeAgent"
        threadId="test-thread"
        hasMessages
        isHydrating={false}
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        listRef={listRef}
        onIsAtEndChange={() => {}}
        timelineEntries={[
          {
            id: "entry-plan-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-plan-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Plan updated",
              tone: "info",
              planSteps: [
                { step: "Inspect code", status: "completed" },
                { step: "Implement card", status: "inProgress" },
                { step: "Verify tests", status: "pending" },
              ],
              planExplanation: "Refining approach",
              planJustCompletedSteps: [{ step: "Inspect code" }],
              planInProgressSteps: [{ step: "Implement card" }],
              planNewSteps: [{ step: "Verify tests" }],
              planTotalCount: 3,
              planCompletedCount: 1,
            },
          },
        ]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        changedFilesExpandedByTurnId={{}}
        onSetChangedFilesExpanded={() => {}}
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={ACTIVE_THREAD_ENVIRONMENT_ID}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        isSendBusy={false}
        isSessionStarting={false}
        hasPendingAssistantResponse={false}
        isPreparingWorktree={false}
        isCompacting={false}
        onSubagentSelect={() => {}}
        editingUserMessageId={null}
        editingUserMessageText=""
        editingUserMessageImages={[]}
        onStartEditUserMessage={() => {}}
        onChangeEditingUserMessageText={() => {}}
        onAddEditingUserMessageImages={() => {}}
        onRemoveEditingUserMessageImage={() => {}}
        onCancelEditUserMessage={() => {}}
        onSubmitEditUserMessage={() => {}}
        onReplyToSelection={() => {}}
      />,
    );

    expect(markup).toContain('data-timeline-row-kind="plan-update"');
    expect(markup).toContain("Plan updated");
    expect(markup).toContain("JUST COMPLETED");
    expect(markup).toContain("NOW WORKING ON");
    expect(markup).toContain("JUST ADDED");
    expect(markup).toContain("Inspect code");
    expect(markup).toContain("Implement card");
    expect(markup).toContain("Verify tests");
    expect(markup).toContain("Refining approach");
  });

  it("renders a show-full affordance for long plan-update previews", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        provider="claudeAgent"
        threadId="test-thread"
        hasMessages
        isHydrating={false}
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        listRef={listRef}
        onIsAtEndChange={() => {}}
        timelineEntries={[
          {
            id: "entry-plan-long",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-plan-long",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Plan updated",
              tone: "info",
              planSteps: Array.from({ length: 8 }, (_, index) => ({
                step: `Step ${index + 1}`,
                status: index < 6 ? "completed" : index === 6 ? "inProgress" : "pending",
              })),
              planJustCompletedSteps: Array.from({ length: 4 }, (_, index) => ({
                step: `Completed ${index + 1}`,
              })),
              planInProgressSteps: [{ step: "Current step" }],
              planNewSteps: [{ step: "New step 1" }, { step: "New step 2" }],
              planTotalCount: 8,
              planCompletedCount: 6,
            },
          },
        ]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        changedFilesExpandedByTurnId={{}}
        onSetChangedFilesExpanded={() => {}}
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={ACTIVE_THREAD_ENVIRONMENT_ID}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        isSendBusy={false}
        isSessionStarting={false}
        hasPendingAssistantResponse={false}
        isPreparingWorktree={false}
        isCompacting={false}
        onSubagentSelect={() => {}}
        editingUserMessageId={null}
        editingUserMessageText=""
        editingUserMessageImages={[]}
        onStartEditUserMessage={() => {}}
        onChangeEditingUserMessageText={() => {}}
        onAddEditingUserMessageImages={() => {}}
        onRemoveEditingUserMessageImage={() => {}}
        onCancelEditUserMessage={() => {}}
        onSubmitEditUserMessage={() => {}}
        onReplyToSelection={() => {}}
      />,
    );

    expect(markup).toContain('aria-label="Show full content"');
    expect(markup).toContain("Show full");
  });

  it("renders context compaction entries in the normal work log", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        provider="claudeAgent"
        threadId="test-thread"
        hasMessages
        isHydrating={false}
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        listRef={listRef}
        onIsAtEndChange={() => {}}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Context compacted",
              tone: "info",
            },
          },
        ]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        changedFilesExpandedByTurnId={{}}
        onSetChangedFilesExpanded={() => {}}
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={ACTIVE_THREAD_ENVIRONMENT_ID}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        isSendBusy={false}
        isSessionStarting={false}
        hasPendingAssistantResponse={false}
        isPreparingWorktree={false}
        isCompacting={false}
        onSubagentSelect={() => {}}
        editingUserMessageId={null}
        editingUserMessageText=""
        editingUserMessageImages={[]}
        onStartEditUserMessage={() => {}}
        onChangeEditingUserMessageText={() => {}}
        onAddEditingUserMessageImages={() => {}}
        onRemoveEditingUserMessageImage={() => {}}
        onCancelEditUserMessage={() => {}}
        onSubmitEditUserMessage={() => {}}
        onReplyToSelection={() => {}}
      />,
    );

    expect(markup).toContain("Context compacted");
    expect(markup).toContain("Work log");
  });

  it("formats changed file paths from the workspace root", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        provider="claudeAgent"
        threadId="test-thread"
        hasMessages
        isHydrating={false}
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnStartedAt={null}
        listRef={listRef}
        onIsAtEndChange={() => {}}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Updated files",
              tone: "tool",
              changedFiles: ["C:/Users/mike/dev-stuff/marcode/apps/web/src/session-logic.ts"],
            },
          },
        ]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        changedFilesExpandedByTurnId={{}}
        onSetChangedFilesExpanded={() => {}}
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={ACTIVE_THREAD_ENVIRONMENT_ID}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot="C:/Users/mike/dev-stuff/marcode"
        isSendBusy={false}
        isSessionStarting={false}
        hasPendingAssistantResponse={false}
        isPreparingWorktree={false}
        isCompacting={false}
        onSubagentSelect={() => {}}
        editingUserMessageId={null}
        editingUserMessageText=""
        editingUserMessageImages={[]}
        onStartEditUserMessage={() => {}}
        onChangeEditingUserMessageText={() => {}}
        onAddEditingUserMessageImages={() => {}}
        onRemoveEditingUserMessageImage={() => {}}
        onCancelEditUserMessage={() => {}}
        onSubmitEditUserMessage={() => {}}
        onReplyToSelection={() => {}}
      />,
    );

    expect(markup).toContain("marcode/apps/web/src/session-logic.ts");
    expect(markup).not.toContain("C:/Users/mike/dev-stuff/marcode/apps/web/src/session-logic.ts");
  });

  it("keeps exploration expandable for Claude and summary-only for Cursor", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const listRef = createRef<LegendListRef | null>();
    const timelineEntries = [
      {
        id: "entry-1",
        kind: "work" as const,
        createdAt: "2026-03-17T19:12:28.000Z",
        entry: {
          id: "work-1",
          createdAt: "2026-03-17T19:12:28.000Z",
          label: "Read file",
          tone: "tool" as const,
          itemType: "file_read" as const,
          toolName: "read",
          toolInput: { file_path: "/repo/project/apps/web/src/App.tsx" },
        },
      },
    ];
    const commonProps = {
      threadId: "test-thread",
      hasMessages: true,
      isHydrating: false,
      isWorking: false,
      activeTurnInProgress: false,
      activeTurnStartedAt: null,
      listRef,
      onIsAtEndChange: () => {},
      timelineEntries,
      completionDividerBeforeEntryId: null,
      completionSummary: null,
      turnDiffSummaryByAssistantMessageId: new Map(),
      changedFilesExpandedByTurnId: {},
      onSetChangedFilesExpanded: () => {},
      onOpenTurnDiff: () => {},
      revertTurnCountByUserMessageId: new Map(),
      onRevertUserMessage: () => {},
      isRevertingCheckpoint: false,
      onImageExpand: () => {},
      activeThreadEnvironmentId: ACTIVE_THREAD_ENVIRONMENT_ID,
      markdownCwd: undefined,
      resolvedTheme: "light" as const,
      timestampFormat: "locale" as const,
      workspaceRoot: "/repo/project",
      isSendBusy: false,
      isSessionStarting: false,
      hasPendingAssistantResponse: false,
      isPreparingWorktree: false,
      isCompacting: false,
      onSubagentSelect: () => {},
      editingUserMessageId: null,
      editingUserMessageText: "",
      editingUserMessageImages: [],
      onStartEditUserMessage: () => {},
      onChangeEditingUserMessageText: () => {},
      onAddEditingUserMessageImages: () => {},
      onRemoveEditingUserMessageImage: () => {},
      onCancelEditUserMessage: () => {},
      onSubmitEditUserMessage: () => {},
      onReplyToSelection: () => {},
    };

    const claudeMarkup = renderToStaticMarkup(
      <MessagesTimeline {...commonProps} provider="claudeAgent" />,
    );
    const cursorMarkup = renderToStaticMarkup(
      <MessagesTimeline {...commonProps} provider="cursor" />,
    );

    expect(claudeMarkup).toContain("<button");
    expect(claudeMarkup).toContain("lucide-chevron-down");
    expect(cursorMarkup).not.toContain("<button");
    expect(cursorMarkup).not.toContain("lucide-chevron-down");
    expect(cursorMarkup).toContain("Explored 1 file");
  });
});
