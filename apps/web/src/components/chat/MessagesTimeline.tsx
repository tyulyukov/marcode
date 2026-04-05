import { type MessageId, type TurnId } from "@marcode/contracts";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deriveTimelineEntries, formatElapsed } from "../../session-logic";
import { type TurnDiffSummary } from "../../types";
import { summarizeTurnDiffStats } from "../../lib/turnDiffTree";
import ChatMarkdown from "../ChatMarkdown";
import {
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  Undo2Icon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { estimateTimelineMessageHeight } from "../timelineHeight";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./ExpandedImagePreview";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import { MessageCopyButton } from "./MessageCopyButton";
import { computeMessageDurationStart, normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import {
  deriveDisplayedUserMessageState,
  type ParsedTerminalContextEntry,
} from "~/lib/terminalContext";
import { extractTrailingJiraContexts, type ParsedJiraContextEntry } from "~/lib/jiraContext";
import { JiraTaskInlineChip } from "./JiraTaskInlineChip";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { type TimestampFormat } from "@marcode/contracts/settings";
import { formatTimestamp } from "../../timestampFormat";
import {
  buildInlineTerminalContextText,
  formatInlineTerminalContextLabel,
  textContainsInlineTerminalContextLabels,
} from "./userMessageTerminalContexts";
import { InlineDiffPreview } from "./InlineDiffPreview";
import { FileChangeCard } from "./FileChangeCard";
import { AgentGroupCard } from "./AgentGroupCard";
import { CommandExecutionCard } from "./CommandExecutionCard";
import { ExplorationCard } from "./ExplorationCard";
import { WebSearchCard } from "./WebSearchCard";
import { WebFetchCard } from "./WebFetchCard";
import { McpToolCallCard } from "./McpToolCallCard";

const MAX_VISIBLE_WORK_LOG_ENTRIES = 6;

const WORK_GROUP_OVERHEAD_HEIGHT = 56;
const WORK_ENTRY_HEIGHT = 30;
const DIFF_PREVIEW_HEADER_HEIGHT = 32;
const DIFF_PREVIEW_LINE_HEIGHT = 18;
const DIFF_PREVIEW_MAX_HEIGHT = 260;
const DIFF_HUNK_SPACING = 8;
const FILE_CHANGE_CARD_COLLAPSED_HEIGHT = 64;
const EXPLORATION_CARD_COLLAPSED_HEIGHT = 36;
const AGENT_GROUP_HEADER_HEIGHT = 32;
const AGENT_TASK_ROW_HEIGHT = 36;
const COMMAND_CARD_COLLAPSED_HEIGHT = 64;
const WEB_SEARCH_CARD_COLLAPSED_HEIGHT = 64;
const WEB_FETCH_CARD_COLLAPSED_HEIGHT = 64;
const MCP_TOOL_CARD_COLLAPSED_HEIGHT = 80;

type TimelineEntry = ReturnType<typeof deriveTimelineEntries>[number];
type TimelineMessage = Extract<TimelineEntry, { kind: "message" }>["message"];
type TimelineProposedPlan = Extract<TimelineEntry, { kind: "proposed-plan" }>["proposedPlan"];
type TimelineWorkEntry = Extract<TimelineEntry, { kind: "work" }>["entry"];
type TimelineRow =
  | {
      kind: "work";
      id: string;
      createdAt: string;
      groupedEntries: TimelineWorkEntry[];
    }
  | {
      kind: "message";
      id: string;
      createdAt: string;
      message: TimelineMessage;
      durationStart: string;
      showCompletionDivider: boolean;
    }
  | {
      kind: "proposed-plan";
      id: string;
      createdAt: string;
      proposedPlan: TimelineProposedPlan;
    }
  | {
      kind: "file-change";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
    }
  | {
      kind: "exploration";
      id: string;
      createdAt: string;
      entries: TimelineWorkEntry[];
      isLive: boolean;
    }
  | {
      kind: "agent-group";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
      isLive: boolean;
    }
  | {
      kind: "command";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
      isLive: boolean;
    }
  | {
      kind: "web-search";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
      isLive: boolean;
    }
  | {
      kind: "web-fetch";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
      isLive: boolean;
    }
  | {
      kind: "mcp-tool";
      id: string;
      createdAt: string;
      entry: TimelineWorkEntry;
      isLive: boolean;
    }
  | { kind: "working"; id: string; createdAt: string | null };

interface TimelineRowContentProps {
  row: TimelineRow;
  expandedWorkGroups: Record<string, boolean>;
  onToggleWorkGroup: (groupId: string) => void;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  allDirectoriesExpandedByTurnId: Record<string, boolean>;
  onToggleAllDirectories: (turnId: TurnId) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  isRevertingCheckpoint: boolean;
  isWorking: boolean;
  isSendBusy: boolean;
  isPreparingWorktree: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
}

const TimelineRowContent = memo(function TimelineRowContent({
  row,
  expandedWorkGroups,
  onToggleWorkGroup,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  allDirectoriesExpandedByTurnId,
  onToggleAllDirectories,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  isRevertingCheckpoint,
  isWorking,
  isSendBusy,
  isPreparingWorktree,
  onImageExpand,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
}: TimelineRowContentProps) {
  return (
    <div
      className="pb-4"
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {row.kind === "work" &&
        (() => {
          const groupId = row.id;
          const groupedEntries = row.groupedEntries;
          const isExpanded = expandedWorkGroups[groupId] ?? false;
          const hasOverflow = groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
          const visibleEntries =
            hasOverflow && !isExpanded
              ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
              : groupedEntries;
          const hiddenCount = groupedEntries.length - visibleEntries.length;
          const onlyToolEntries = groupedEntries.every((entry) => entry.tone === "tool");
          const showHeader = hasOverflow || !onlyToolEntries;
          const groupLabel = onlyToolEntries ? "Tool calls" : "Work log";

          return (
            <div className="rounded-xl border border-border/45 bg-card/25 px-2 py-1.5">
              {showHeader && (
                <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/55">
                    {groupLabel} ({groupedEntries.length})
                  </p>
                  {hasOverflow && (
                    <button
                      type="button"
                      className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/55 transition-colors duration-150 hover:text-foreground/75"
                      onClick={() => onToggleWorkGroup(groupId)}
                    >
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleEntries.map((workEntry) => (
                  <SimpleWorkEntryRow key={`work-row:${workEntry.id}`} workEntry={workEntry} />
                ))}
              </div>
            </div>
          );
        })()}

      {row.kind === "file-change" && <FileChangeCard diffPreviews={row.entry.diffPreviews ?? []} />}

      {row.kind === "exploration" && <ExplorationCard entries={row.entries} isLive={row.isLive} />}

      {row.kind === "agent-group" && row.entry.agentGroup && (
        <AgentGroupCard
          agentGroup={row.entry.agentGroup}
          label={row.entry.label}
          isLive={row.isLive}
        />
      )}

      {row.kind === "command" && <CommandExecutionCard entry={row.entry} isLive={row.isLive} />}

      {row.kind === "web-search" && <WebSearchCard entry={row.entry} isLive={row.isLive} />}

      {row.kind === "web-fetch" && <WebFetchCard entry={row.entry} isLive={row.isLive} />}

      {row.kind === "mcp-tool" && <McpToolCallCard entry={row.entry} isLive={row.isLive} />}

      {row.kind === "message" &&
        row.message.role === "user" &&
        (() => {
          const userImages = row.message.attachments ?? [];
          const displayedUserMessage = deriveDisplayedUserMessageState(row.message.text);
          const terminalContexts = displayedUserMessage.contexts;
          const jiraExtracted = extractTrailingJiraContexts(displayedUserMessage.visibleText);
          const visibleText =
            jiraExtracted.contexts.length > 0
              ? jiraExtracted.promptText
              : displayedUserMessage.visibleText;
          const jiraContextMap = new Map(
            jiraExtracted.contexts.map((ctx) => {
              const keyMatch = ctx.header.match(/^\[([A-Z][A-Z0-9]+-\d+)]/);
              return [keyMatch?.[1]?.toUpperCase() ?? "", ctx] as const;
            }),
          );
          const canRevertAgentWork = revertTurnCountByUserMessageId.has(row.message.id);
          return (
            <div className="flex justify-end">
              <div className="group relative max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3">
                {userImages.length > 0 && (
                  <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
                    {userImages.map(
                      (image: NonNullable<TimelineMessage["attachments"]>[number]) => (
                        <div
                          key={image.id}
                          className="overflow-hidden rounded-lg border border-border/80 bg-background/70"
                        >
                          {image.previewUrl ? (
                            <button
                              type="button"
                              className="h-full w-full cursor-zoom-in"
                              aria-label={`Preview ${image.name}`}
                              onClick={() => {
                                const preview = buildExpandedImagePreview(userImages, image.id);
                                if (!preview) return;
                                onImageExpand(preview);
                              }}
                            >
                              <img
                                src={image.previewUrl}
                                alt={image.name}
                                className="h-full max-h-[220px] w-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="flex min-h-[72px] items-center justify-center px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                              {image.name}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {(visibleText.trim().length > 0 || terminalContexts.length > 0) && (
                  <UserMessageBody
                    text={visibleText}
                    terminalContexts={terminalContexts}
                    jiraContextMap={jiraContextMap}
                  />
                )}
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    {visibleText && <MessageCopyButton text={visibleText} />}
                    {canRevertAgentWork && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isRevertingCheckpoint || isWorking}
                        onClick={() => onRevertUserMessage(row.message.id)}
                        title="Revert to this message"
                      >
                        <Undo2Icon className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground/30">
                    {formatTimestamp(row.message.createdAt, timestampFormat)}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "assistant" &&
        (() => {
          const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");
          return (
            <>
              {row.showCompletionDivider && (
                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {completionSummary ? `Response • ${completionSummary}` : "Response"}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="group/msg min-w-0 px-1 py-0.5">
                <ChatMarkdown
                  text={messageText}
                  cwd={markdownCwd}
                  isStreaming={Boolean(row.message.streaming)}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="text-[10px] text-muted-foreground/30">
                    {row.message.streaming ? (
                      <StreamingMessageMeta
                        createdAt={row.message.createdAt}
                        durationStart={row.durationStart}
                        timestampFormat={timestampFormat}
                      />
                    ) : (
                      formatMessageMeta(
                        row.message.createdAt,
                        formatElapsed(row.durationStart, row.message.completedAt),
                        timestampFormat,
                      )
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/msg:opacity-100">
                    <MessageCopyButton text={messageText} />
                  </div>
                </div>
                {(() => {
                  const turnSummary = turnDiffSummaryByAssistantMessageId.get(row.message.id);
                  if (!turnSummary) return null;
                  const checkpointFiles = turnSummary.files;
                  if (checkpointFiles.length === 0) return null;
                  const summaryStat = summarizeTurnDiffStats(checkpointFiles);
                  const changedFileCountLabel = String(checkpointFiles.length);
                  const allDirectoriesExpanded =
                    allDirectoriesExpandedByTurnId[turnSummary.turnId] ?? true;
                  return (
                    <div className="mt-2 rounded-lg border border-border/80 bg-card/45 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">
                          <span>Changed files ({changedFileCountLabel})</span>
                          {hasNonZeroStat(summaryStat) && (
                            <>
                              <span className="mx-1">•</span>
                              <DiffStatLabel
                                additions={summaryStat.additions}
                                deletions={summaryStat.deletions}
                              />
                            </>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => onToggleAllDirectories(turnSummary.turnId)}
                          >
                            {allDirectoriesExpanded ? "Collapse all" : "Expand all"}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              onOpenTurnDiff(turnSummary.turnId, checkpointFiles[0]?.path)
                            }
                          >
                            View diff
                          </Button>
                        </div>
                      </div>
                      <ChangedFilesTree
                        key={`changed-files-tree:${turnSummary.turnId}`}
                        turnId={turnSummary.turnId}
                        files={checkpointFiles}
                        allDirectoriesExpanded={allDirectoriesExpanded}
                        resolvedTheme={resolvedTheme}
                        onOpenTurnDiff={onOpenTurnDiff}
                      />
                    </div>
                  );
                })()}
              </div>
            </>
          );
        })()}

      {row.kind === "proposed-plan" && (
        <div className="group min-w-0 px-1 py-0.5">
          <ProposedPlanCard
            planMarkdown={row.proposedPlan.planMarkdown}
            cwd={markdownCwd}
            workspaceRoot={workspaceRoot}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
              <MessageCopyButton text={row.proposedPlan.planMarkdown} />
            </div>
          </div>
        </div>
      )}

      {row.kind === "working" && (
        <div className="py-0.5 pl-1.5">
          <span className="shiny-text pt-1 text-xs font-semibold text-primary/60">
            {isPreparingWorktree ? (
              "Preparing worktree\u2026"
            ) : isSendBusy ? (
              "Starting\u2026"
            ) : row.createdAt ? (
              <WorkingElapsedLabel startIso={row.createdAt} />
            ) : (
              "Working\u2026"
            )}
          </span>
        </div>
      )}
    </div>
  );
});

function estimateWorkRowHeight(groupedEntries: ReadonlyArray<TimelineWorkEntry>): number {
  const visibleCount = Math.min(groupedEntries.length, MAX_VISIBLE_WORK_LOG_ENTRIES);
  const baseHeight = WORK_GROUP_OVERHEAD_HEIGHT + visibleCount * WORK_ENTRY_HEIGHT;

  let extraHeight = 0;
  const visibleEntries =
    groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES
      ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
      : groupedEntries;

  for (const entry of visibleEntries) {
    const previews = entry.diffPreviews;
    if (!previews || previews.length === 0) continue;
    for (const hunk of previews) {
      const bodyHeight = Math.min(
        hunk.lines.length * DIFF_PREVIEW_LINE_HEIGHT,
        DIFF_PREVIEW_MAX_HEIGHT,
      );
      extraHeight += DIFF_PREVIEW_HEADER_HEIGHT + bodyHeight + DIFF_HUNK_SPACING;
    }
  }

  return baseHeight + extraHeight;
}

interface MessagesTimelineProps {
  hasMessages: boolean;
  isWorking: boolean;
  isSendBusy: boolean;
  isPreparingWorktree: boolean;
  activeTurnStartedAt: string | null;
  timelineEntries: ReturnType<typeof deriveTimelineEntries>;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  expandedWorkGroups: Record<string, boolean>;
  onToggleWorkGroup: (groupId: string) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
}

export const MessagesTimeline = memo(function MessagesTimeline({
  hasMessages,
  isWorking,
  isSendBusy,
  isPreparingWorktree,
  activeTurnStartedAt,
  timelineEntries,
  completionDividerBeforeEntryId,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  expandedWorkGroups,
  onToggleWorkGroup,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  isRevertingCheckpoint,
  onImageExpand,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
}: MessagesTimelineProps) {
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const timelineRoot = timelineRootRef.current;
    if (!timelineRoot) return;

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((previousWidth) => {
        if (previousWidth !== null && Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }
        return nextWidth;
      });
    };

    updateWidth(timelineRoot.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateWidth(timelineRoot.getBoundingClientRect().width);
    });
    observer.observe(timelineRoot);
    return () => {
      observer.disconnect();
    };
  }, [hasMessages, isWorking]);

  const rows = useMemo<TimelineRow[]>(() => {
    const nextRows: TimelineRow[] = [];
    const durationStartByMessageId = computeMessageDurationStart(
      timelineEntries.flatMap((entry) => (entry.kind === "message" ? [entry.message] : [])),
    );

    for (let index = 0; index < timelineEntries.length; index += 1) {
      const timelineEntry = timelineEntries[index];
      if (!timelineEntry) {
        continue;
      }

      if (timelineEntry.kind === "work") {
        let pendingWork: TimelineWorkEntry[] = [];
        let pendingWorkFirstId: string | null = null;
        let pendingWorkFirstCreatedAt: string | null = null;
        let pendingExploration: TimelineWorkEntry[] = [];
        let pendingExplorationFirstId: string | null = null;
        let pendingExplorationFirstCreatedAt: string | null = null;
        let cursor = index;

        const flushPendingWork = () => {
          if (pendingWork.length > 0) {
            nextRows.push({
              kind: "work",
              id: pendingWorkFirstId!,
              createdAt: pendingWorkFirstCreatedAt!,
              groupedEntries: pendingWork,
            });
            pendingWork = [];
            pendingWorkFirstId = null;
            pendingWorkFirstCreatedAt = null;
          }
        };

        const flushPendingExploration = () => {
          if (pendingExploration.length > 0) {
            nextRows.push({
              kind: "exploration",
              id: pendingExplorationFirstId!,
              createdAt: pendingExplorationFirstCreatedAt!,
              entries: pendingExploration,
              isLive: false,
            });
            pendingExploration = [];
            pendingExplorationFirstId = null;
            pendingExplorationFirstCreatedAt = null;
          }
        };

        while (cursor < timelineEntries.length) {
          const current = timelineEntries[cursor];
          if (!current || current.kind !== "work") break;

          if (current.entry.agentGroup) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "agent-group",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
              isLive: false,
            });
          } else if (isCommandEntry(current.entry)) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "command",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
              isLive: false,
            });
          } else if (isWebSearchEntry(current.entry)) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "web-search",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
              isLive: false,
            });
          } else if (isWebFetchEntry(current.entry)) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "web-fetch",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
              isLive: false,
            });
          } else if (isMcpToolEntry(current.entry)) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "mcp-tool",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
              isLive: false,
            });
          } else if (
            current.entry.itemType === "file_change" &&
            (current.entry.diffPreviews?.length ?? 0) > 0
          ) {
            flushPendingWork();
            flushPendingExploration();
            nextRows.push({
              kind: "file-change",
              id: current.id,
              createdAt: current.createdAt,
              entry: current.entry,
            });
          } else if (isExplorationEntry(current.entry)) {
            flushPendingWork();
            if (pendingExploration.length === 0) {
              pendingExplorationFirstId = current.id;
              pendingExplorationFirstCreatedAt = current.createdAt;
            }
            pendingExploration.push(current.entry);
          } else {
            flushPendingExploration();
            if (pendingWork.length === 0) {
              pendingWorkFirstId = current.id;
              pendingWorkFirstCreatedAt = current.createdAt;
            }
            pendingWork.push(current.entry);
          }
          cursor += 1;
        }
        flushPendingWork();
        flushPendingExploration();
        index = cursor - 1;
        continue;
      }

      if (timelineEntry.kind === "proposed-plan") {
        nextRows.push({
          kind: "proposed-plan",
          id: timelineEntry.id,
          createdAt: timelineEntry.createdAt,
          proposedPlan: timelineEntry.proposedPlan,
        });
        continue;
      }

      nextRows.push({
        kind: "message",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        message: timelineEntry.message,
        durationStart:
          durationStartByMessageId.get(timelineEntry.message.id) ?? timelineEntry.message.createdAt,
        showCompletionDivider:
          timelineEntry.message.role === "assistant" &&
          completionDividerBeforeEntryId === timelineEntry.id,
      });
    }

    if (isWorking) {
      for (let i = nextRows.length - 1; i >= 0; i--) {
        const r = nextRows[i];
        if (!r) break;
        if (
          r.kind === "exploration" ||
          r.kind === "agent-group" ||
          r.kind === "command" ||
          r.kind === "web-search" ||
          r.kind === "web-fetch" ||
          r.kind === "mcp-tool"
        ) {
          nextRows[i] = { ...r, isLive: true };
          break;
        }
        if (r.kind === "message" || r.kind === "proposed-plan") break;
      }

      nextRows.push({
        kind: "working",
        id: "working-indicator-row",
        createdAt: activeTurnStartedAt,
      });
    }

    return nextRows;
  }, [timelineEntries, completionDividerBeforeEntryId, isWorking, activeTurnStartedAt]);

  const [allDirectoriesExpandedByTurnId, setAllDirectoriesExpandedByTurnId] = useState<
    Record<string, boolean>
  >({});
  const onToggleAllDirectories = useCallback((turnId: TurnId) => {
    setAllDirectoriesExpandedByTurnId((current) => ({
      ...current,
      [turnId]: !(current[turnId] ?? true),
    }));
  }, []);

  if (!hasMessages && !isWorking) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground/30">
          Send a message to start the conversation.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={timelineRootRef}
      data-timeline-root="true"
      className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden"
    >
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            contentVisibility: "auto",
            containIntrinsicBlockSize: `auto ${estimateRowHeight(row, timelineWidthPx)}px`,
          }}
        >
          <TimelineRowContent
            row={row}
            expandedWorkGroups={expandedWorkGroups}
            onToggleWorkGroup={onToggleWorkGroup}
            completionSummary={completionSummary}
            turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
            allDirectoriesExpandedByTurnId={allDirectoriesExpandedByTurnId}
            onToggleAllDirectories={onToggleAllDirectories}
            onOpenTurnDiff={onOpenTurnDiff}
            revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
            onRevertUserMessage={onRevertUserMessage}
            isRevertingCheckpoint={isRevertingCheckpoint}
            isWorking={isWorking}
            isSendBusy={isSendBusy}
            isPreparingWorktree={isPreparingWorktree}
            onImageExpand={onImageExpand}
            markdownCwd={markdownCwd}
            resolvedTheme={resolvedTheme}
            timestampFormat={timestampFormat}
            workspaceRoot={workspaceRoot}
          />
        </div>
      ))}
    </div>
  );
});

function estimateTimelineProposedPlanHeight(proposedPlan: TimelineProposedPlan): number {
  const estimatedLines = Math.max(1, Math.ceil(proposedPlan.planMarkdown.length / 72));
  return 120 + Math.min(estimatedLines * 22, 880);
}

function estimateRowHeight(row: TimelineRow, timelineWidthPx: number | null): number {
  if (row.kind === "work") return estimateWorkRowHeight(row.groupedEntries);
  if (row.kind === "proposed-plan") return estimateTimelineProposedPlanHeight(row.proposedPlan);
  if (row.kind === "working") return 40;
  if (row.kind === "file-change") return FILE_CHANGE_CARD_COLLAPSED_HEIGHT;
  if (row.kind === "exploration") return EXPLORATION_CARD_COLLAPSED_HEIGHT;
  if (row.kind === "agent-group") {
    const taskCount = row.entry.agentGroup?.tasks.length ?? 1;
    return AGENT_GROUP_HEADER_HEIGHT + taskCount * AGENT_TASK_ROW_HEIGHT + 12;
  }
  if (row.kind === "command") return COMMAND_CARD_COLLAPSED_HEIGHT;
  if (row.kind === "web-search") return WEB_SEARCH_CARD_COLLAPSED_HEIGHT;
  if (row.kind === "web-fetch") return WEB_FETCH_CARD_COLLAPSED_HEIGHT;
  if (row.kind === "mcp-tool") return MCP_TOOL_CARD_COLLAPSED_HEIGHT;
  return estimateTimelineMessageHeight(row.message, { timelineWidthPx });
}

function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatMessageMeta(
  createdAt: string,
  duration: string | null,
  timestampFormat: TimestampFormat,
): string {
  if (!duration) return formatTimestamp(createdAt, timestampFormat);
  return `${formatTimestamp(createdAt, timestampFormat)} • ${duration}`;
}

function useLiveTick(): string {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return new Date(tick).toISOString();
}

const WorkingElapsedLabel = memo(function WorkingElapsedLabel(props: { startIso: string }) {
  const nowIso = useLiveTick();
  return <>Working for {formatWorkingTimer(props.startIso, nowIso) ?? "0s"}</>;
});

const StreamingMessageMeta = memo(function StreamingMessageMeta(props: {
  createdAt: string;
  durationStart: string;
  timestampFormat: TimestampFormat;
}) {
  const nowIso = useLiveTick();
  const duration = formatElapsed(props.durationStart, nowIso);
  return <>{formatMessageMeta(props.createdAt, duration, props.timestampFormat)}</>;
});

const UserMessageTerminalContextInlineLabel = memo(
  function UserMessageTerminalContextInlineLabel(props: { context: ParsedTerminalContextEntry }) {
    const tooltipText =
      props.context.body.length > 0
        ? `${props.context.header}\n${props.context.body}`
        : props.context.header;

    return <TerminalContextInlineChip label={props.context.header} tooltipText={tooltipText} />;
  },
);

const JIRA_INLINE_LABEL_PATTERN = /@jira:([A-Z][A-Z0-9]+-\d+)/gi;

function renderTextWithJiraChips(
  text: string,
  keyPrefix: string,
  jiraContextMap: ReadonlyMap<string, ParsedJiraContextEntry>,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(JIRA_INLINE_LABEL_PATTERN)) {
    const matchStart = match.index ?? 0;
    const issueKey = match[1] ?? "";
    if (matchStart > cursor) {
      nodes.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, matchStart)}</span>);
    }
    const context = jiraContextMap.get(issueKey.toUpperCase());
    nodes.push(
      <JiraTaskInlineChip
        key={`${keyPrefix}-jira-${issueKey}`}
        label={issueKey}
        tooltipText={context ? context.header : issueKey}
        detailHeader={context?.header}
        detailBody={context?.body}
      />,
    );
    cursor = matchStart + match[0].length;
  }
  if (cursor === 0) return [];
  if (cursor < text.length) {
    nodes.push(<span key={`${keyPrefix}-text-rest`}>{text.slice(cursor)}</span>);
  }
  return nodes;
}

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  terminalContexts: ParsedTerminalContextEntry[];
  jiraContextMap: ReadonlyMap<string, ParsedJiraContextEntry>;
}) {
  if (props.terminalContexts.length > 0) {
    const hasEmbeddedInlineLabels = textContainsInlineTerminalContextLabels(
      props.text,
      props.terminalContexts,
    );
    const inlinePrefix = buildInlineTerminalContextText(props.terminalContexts);
    const inlineNodes: ReactNode[] = [];

    if (hasEmbeddedInlineLabels) {
      let cursor = 0;

      for (const context of props.terminalContexts) {
        const label = formatInlineTerminalContextLabel(context.header);
        const matchIndex = props.text.indexOf(label, cursor);
        if (matchIndex === -1) {
          inlineNodes.length = 0;
          break;
        }
        if (matchIndex > cursor) {
          inlineNodes.push(
            <span key={`user-terminal-context-inline-before:${context.header}:${cursor}`}>
              {props.text.slice(cursor, matchIndex)}
            </span>,
          );
        }
        inlineNodes.push(
          <UserMessageTerminalContextInlineLabel
            key={`user-terminal-context-inline:${context.header}`}
            context={context}
          />,
        );
        cursor = matchIndex + label.length;
      }

      if (inlineNodes.length > 0) {
        if (cursor < props.text.length) {
          inlineNodes.push(
            <span key={`user-message-terminal-context-inline-rest:${cursor}`}>
              {props.text.slice(cursor)}
            </span>,
          );
        }

        return (
          <div className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {inlineNodes}
          </div>
        );
      }
    }

    for (const context of props.terminalContexts) {
      inlineNodes.push(
        <UserMessageTerminalContextInlineLabel
          key={`user-terminal-context-inline:${context.header}`}
          context={context}
        />,
      );
      inlineNodes.push(
        <span key={`user-terminal-context-inline-space:${context.header}`} aria-hidden="true">
          {" "}
        </span>,
      );
    }

    if (props.text.length > 0) {
      inlineNodes.push(<span key="user-message-terminal-context-inline-text">{props.text}</span>);
    } else if (inlinePrefix.length === 0) {
      return null;
    }

    return (
      <div className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {inlineNodes}
      </div>
    );
  }

  if (props.text.length === 0) {
    return null;
  }

  const jiraNodes = renderTextWithJiraChips(props.text, "user-msg-jira", props.jiraContextMap);
  if (jiraNodes.length > 0) {
    return (
      <div className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
        {jiraNodes}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
      {props.text}
    </div>
  );
});

function workToneIcon(tone: TimelineWorkEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckIcon,
      className: "text-foreground/92",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

const EXPLORATION_LABEL_RE =
  /^(Read|Search(ed)?|Glob(bed)?|Grep(ped)?|List(ed)?|Find|Found|View(ed)?|Inspect(ed)?)\b/i;

const EXPLORATION_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "search",
  "find",
  "list",
  "view",
  "ls",
  "cat",
  "head",
  "tail",
]);

function isExplorationToolName(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return EXPLORATION_TOOL_NAMES.has(toolName.toLowerCase());
}

function isExplorationEntry(entry: TimelineWorkEntry): boolean {
  if (entry.requestKind === "file-change" || entry.requestKind === "command") return false;
  if (
    entry.itemType === "file_change" ||
    entry.itemType === "command_execution" ||
    entry.itemType === "web_search" ||
    entry.itemType === "web_fetch" ||
    entry.itemType === "mcp_tool_call"
  )
    return false;
  if (entry.command) return false;
  if ((entry.diffPreviews?.length ?? 0) > 0) return false;
  if (entry.agentGroup) return false;

  if (entry.requestKind === "file-read") return true;
  if (entry.itemType === "file_read") return true;
  if (entry.itemType === "image_view") return true;
  if (isExplorationToolName(entry.toolName)) return true;

  const heading = (entry.toolTitle ?? entry.label).trim();
  return EXPLORATION_LABEL_RE.test(heading);
}

function isCommandEntry(entry: TimelineWorkEntry): boolean {
  return (
    entry.requestKind === "command" || entry.itemType === "command_execution" || !!entry.command
  );
}

function isWebSearchEntry(entry: TimelineWorkEntry): boolean {
  if (entry.itemType === "web_search") return true;
  const lower = entry.toolName?.toLowerCase() ?? "";
  return lower === "websearch" || lower === "web_search";
}

function isWebFetchEntry(entry: TimelineWorkEntry): boolean {
  if (entry.itemType === "web_fetch") return true;
  const lower = entry.toolName?.toLowerCase() ?? "";
  return lower === "webfetch" || lower === "web_fetch";
}

function isMcpToolEntry(entry: TimelineWorkEntry): boolean {
  if (entry.itemType === "mcp_tool_call") return true;
  return (entry.toolName ?? "").startsWith("mcp__");
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function workEntryPreview(
  workEntry: Pick<TimelineWorkEntry, "detail" | "command" | "changedFiles" | "toolName">,
) {
  if (workEntry.command) return workEntry.command;
  if (workEntry.detail) return cleanToolDetail(workEntry.detail, workEntry.toolName);
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
}

const TOOL_DETAIL_PREFIX_RE = /^[A-Za-z_]+:\s*/;
const JSON_OBJECT_RE = /^\{.*\}$/s;

function cleanToolDetail(detail: string, toolName: string | undefined): string {
  let cleaned = detail;
  if (toolName && cleaned.startsWith(`${toolName}:`)) {
    cleaned = cleaned.slice(toolName.length + 1).trim();
  } else if (TOOL_DETAIL_PREFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(TOOL_DETAIL_PREFIX_RE, "").trim();
  }
  if (JSON_OBJECT_RE.test(cleaned)) {
    const friendly = friendlyJsonDetail(cleaned);
    if (friendly) return friendly;
  }
  return cleaned;
}

function friendlyJsonDetail(jsonStr: string): string | null {
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const filePath =
      typeof parsed.file_path === "string"
        ? parsed.file_path
        : typeof parsed.filePath === "string"
          ? parsed.filePath
          : typeof parsed.path === "string"
            ? parsed.path
            : null;
    if (filePath) {
      const parts = filePath.split("/");
      return parts.length > 3 ? parts.slice(-3).join("/") : filePath;
    }
    const pattern = typeof parsed.pattern === "string" ? parsed.pattern : null;
    const path = typeof parsed.path === "string" ? parsed.path : null;
    if (pattern && path) {
      const shortPath = path.split("/").slice(-3).join("/");
      return `"${pattern}" in ${shortPath}`;
    }
    if (pattern) return `"${pattern}"`;
    return null;
  } catch {
    return null;
  }
}

function workEntryIcon(workEntry: TimelineWorkEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "file_read" || isExplorationToolName(workEntry.toolName))
    return EyeIcon;
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "web_fetch") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: TimelineWorkEntry): string {
  const raw = workEntry.toolTitle ?? workEntry.label;
  const normalized = normalizeCompactToolLabel(raw);
  if (isGenericToolLabel(normalized) && workEntry.toolName) {
    return friendlyToolHeading(workEntry.toolName);
  }
  return capitalizePhrase(normalized);
}

function isGenericToolLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  return (
    lower === "tool call" ||
    lower === "tool" ||
    lower === "tool updated" ||
    lower === "tool started" ||
    lower === "item"
  );
}

function friendlyToolHeading(toolName: string): string {
  const lower = toolName.toLowerCase();
  switch (lower) {
    case "read":
      return "Read file";
    case "edit":
      return "Edit file";
    case "write":
      return "Write file";
    case "grep":
      return "Grep search";
    case "glob":
      return "Glob search";
    case "bash":
      return "Run command";
    case "webfetch":
    case "web_fetch":
      return "Fetch URL";
    case "websearch":
    case "web_search":
      return "Web search";
    default:
      return capitalizePhrase(toolName);
  }
}

const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: {
  workEntry: TimelineWorkEntry;
}) {
  const { workEntry } = props;
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const preview = workEntryPreview(workEntry);
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const hasChangedFiles = (workEntry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !workEntry.command && !workEntry.detail;

  const hasDiffPreviews = (workEntry.diffPreviews?.length ?? 0) > 0;

  return (
    <div className="rounded-lg px-1 py-1">
      <div className="flex items-center gap-2 transition-[opacity,translate] duration-200">
        <span
          className={cn("flex size-5 shrink-0 items-center justify-center", iconConfig.className)}
        >
          <EntryIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <p
                  className={cn(
                    "truncate text-[11px] leading-5",
                    workToneClass(workEntry.tone),
                    preview ? "text-muted-foreground/70" : "",
                  )}
                >
                  <span className={cn("text-foreground/80", workToneClass(workEntry.tone))}>
                    {heading}
                  </span>
                  {preview && <span className="text-muted-foreground/55"> - {preview}</span>}
                </p>
              }
            />
            <TooltipPopup
              side="top"
              className="max-w-lg break-words whitespace-pre-wrap leading-tight"
            >
              {displayText}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
      {hasDiffPreviews ? (
        <div className="mt-0.5 pl-5">
          {(workEntry.diffPreviews ?? []).map((hunk) => (
            <InlineDiffPreview key={`${workEntry.id}:diff:${hunk.filePath}`} hunk={hunk} />
          ))}
        </div>
      ) : (
        hasChangedFiles &&
        !previewIsChangedFiles && (
          <div className="mt-1 flex flex-wrap gap-1 pl-6">
            {workEntry.changedFiles?.slice(0, 4).map((filePath) => (
              <Tooltip key={`${workEntry.id}:${filePath}`}>
                <TooltipTrigger
                  render={
                    <span className="max-w-48 truncate rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75">
                      {filePath}
                    </span>
                  }
                />
                <TooltipPopup side="top" className="max-w-lg break-all leading-tight">
                  {filePath}
                </TooltipPopup>
              </Tooltip>
            ))}
            {(workEntry.changedFiles?.length ?? 0) > 4 && (
              <span className="px-1 text-[10px] text-muted-foreground/55">
                +{(workEntry.changedFiles?.length ?? 0) - 4}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
});
