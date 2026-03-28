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
import {
  deriveTimelineEntries,
  formatElapsed,
  formatTokenCount,
  formatToolUseCount,
  type AgentGroup,
  type AgentTaskSummary,
} from "../../session-logic";
import { type TurnDiffSummary } from "../../types";
import { summarizeTurnDiffStats } from "../../lib/turnDiffTree";
import ChatMarkdown from "../ChatMarkdown";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
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
import { cn } from "~/lib/utils";
import { type TimestampFormat } from "@marcode/contracts/settings";
import { formatTimestamp } from "../../timestampFormat";
import {
  buildInlineTerminalContextText,
  formatInlineTerminalContextLabel,
  textContainsInlineTerminalContextLabels,
} from "./userMessageTerminalContexts";
import { InlineDiffPreview } from "./InlineDiffPreview";

const MAX_VISIBLE_WORK_LOG_ENTRIES = 6;

const WORK_GROUP_OVERHEAD_HEIGHT = 56;
const WORK_ENTRY_HEIGHT = 30;
const DIFF_PREVIEW_HEADER_HEIGHT = 32;
const DIFF_PREVIEW_LINE_HEIGHT = 18;
const DIFF_PREVIEW_MAX_HEIGHT = 260;
const DIFF_HUNK_SPACING = 8;
const AGENT_GROUP_HEADER_HEIGHT = 32;

function estimateWorkRowHeight(
  groupedEntries: ReadonlyArray<TimelineWorkEntry>,
  showInlineDiffs: boolean,
): number {
  const visibleCount = Math.min(groupedEntries.length, MAX_VISIBLE_WORK_LOG_ENTRIES);
  const baseHeight = WORK_GROUP_OVERHEAD_HEIGHT + visibleCount * WORK_ENTRY_HEIGHT;

  let extraHeight = 0;
  const visibleEntries =
    groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES
      ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
      : groupedEntries;

  for (const entry of visibleEntries) {
    if (entry.agentGroup) {
      extraHeight += AGENT_GROUP_HEADER_HEIGHT;
      continue;
    }
    if (!showInlineDiffs) continue;
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
  showInlineDiffs: boolean;
  workspaceRoot: string | undefined;
}

export const MessagesTimeline = memo(function MessagesTimeline({
  hasMessages,
  isWorking,
  isSendBusy,
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
  showInlineDiffs,
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
        const groupedEntries = [timelineEntry.entry];
        let cursor = index + 1;
        while (cursor < timelineEntries.length) {
          const nextEntry = timelineEntries[cursor];
          if (!nextEntry || nextEntry.kind !== "work") break;
          groupedEntries.push(nextEntry.entry);
          cursor += 1;
        }
        nextRows.push({
          kind: "work",
          id: timelineEntry.id,
          createdAt: timelineEntry.createdAt,
          groupedEntries,
        });
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

  const renderRowContent = (row: TimelineRow) => (
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
                {visibleEntries.map((workEntry) =>
                  workEntry.agentGroup ? (
                    <AgentGroupRow
                      key={workEntry.id}
                      agentGroup={workEntry.agentGroup}
                      label={workEntry.label}
                    />
                  ) : (
                    <SimpleWorkEntryRow
                      key={`work-row:${workEntry.id}`}
                      workEntry={workEntry}
                      showInlineDiffs={showInlineDiffs}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "user" &&
        (() => {
          const userImages = row.message.attachments ?? [];
          const displayedUserMessage = deriveDisplayedUserMessageState(row.message.text);
          const terminalContexts = displayedUserMessage.contexts;
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
                {(displayedUserMessage.visibleText.trim().length > 0 ||
                  terminalContexts.length > 0) && (
                  <UserMessageBody
                    text={displayedUserMessage.visibleText}
                    terminalContexts={terminalContexts}
                  />
                )}
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    {displayedUserMessage.copyText && (
                      <MessageCopyButton text={displayedUserMessage.copyText} />
                    )}
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
              <div className="min-w-0 px-1 py-0.5">
                <ChatMarkdown
                  text={messageText}
                  cwd={markdownCwd}
                  isStreaming={Boolean(row.message.streaming)}
                />
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
                <p className="mt-1.5 text-[10px] text-muted-foreground/30">
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
              </div>
            </>
          );
        })()}

      {row.kind === "proposed-plan" && (
        <div className="min-w-0 px-1 py-0.5">
          <ProposedPlanCard
            planMarkdown={row.proposedPlan.planMarkdown}
            cwd={markdownCwd}
            workspaceRoot={workspaceRoot}
          />
        </div>
      )}

      {row.kind === "working" && (
        <div className="py-0.5 pl-1.5">
          <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-[3px]">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:200ms]" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:400ms]" />
            </span>
            <span>
              {isSendBusy ? (
                "Starting\u2026"
              ) : row.createdAt ? (
                <WorkingElapsedLabel startIso={row.createdAt} />
              ) : (
                "Working\u2026"
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );

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
            containIntrinsicBlockSize: `auto ${estimateRowHeight(row, showInlineDiffs, timelineWidthPx)}px`,
          }}
        >
          {renderRowContent(row)}
        </div>
      ))}
    </div>
  );
});

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
  | { kind: "working"; id: string; createdAt: string | null };

function estimateTimelineProposedPlanHeight(proposedPlan: TimelineProposedPlan): number {
  const estimatedLines = Math.max(1, Math.ceil(proposedPlan.planMarkdown.length / 72));
  return 120 + Math.min(estimatedLines * 22, 880);
}

function estimateRowHeight(
  row: TimelineRow,
  showInlineDiffs: boolean,
  timelineWidthPx: number | null,
): number {
  if (row.kind === "work") return estimateWorkRowHeight(row.groupedEntries, showInlineDiffs);
  if (row.kind === "proposed-plan") return estimateTimelineProposedPlanHeight(row.proposedPlan);
  if (row.kind === "working") return 40;
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

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  terminalContexts: ParsedTerminalContextEntry[];
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

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function workEntryPreview(
  workEntry: Pick<TimelineWorkEntry, "detail" | "command" | "changedFiles">,
) {
  if (workEntry.command) return workEntry.command;
  if (workEntry.detail) return workEntry.detail;
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
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
  if (workEntry.itemType === "web_search") return GlobeIcon;
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
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

function formatAgentTaskType(taskType: string | null): string | null {
  if (!taskType) return null;
  const normalized = taskType.trim().toLowerCase();
  if (normalized === "default" || normalized.length === 0) return null;
  return normalized
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function agentTaskStatusAccent(status: AgentTaskSummary["status"]): string {
  switch (status) {
    case "running":
      return "border-l-amber-400/70";
    case "failed":
      return "border-l-rose-400/70";
    case "completed":
      return "border-l-emerald-500/70";
    case "stopped":
      return "border-l-muted-foreground/40";
  }
}

function agentTaskActivityLine(task: AgentTaskSummary): string | null {
  if (task.status === "completed") return null;
  if (task.status === "failed") return "Failed";
  if (task.status === "stopped") return "Stopped";
  if (task.lastToolName) return `Using ${normalizeCompactToolLabel(task.lastToolName)}`;
  if (task.progressSummary) return task.progressSummary;
  return "Starting…";
}

function agentTaskMeta(task: AgentTaskSummary): string {
  const parts: string[] = [];
  if (task.toolUses !== null) parts.push(formatToolUseCount(task.toolUses));
  if (task.totalTokens !== null) parts.push(formatTokenCount(task.totalTokens));
  return parts.join(" · ");
}

const AgentTaskRow = memo(function AgentTaskRow(props: { task: AgentTaskSummary }) {
  const { task } = props;
  const typeLabel = formatAgentTaskType(task.agentType);
  const isRunning = task.status === "running";
  const activityLine = agentTaskActivityLine(task);
  const meta = agentTaskMeta(task);

  return (
    <div
      className={cn("rounded-md border-l-2 py-1 pl-2.5 pr-1.5", agentTaskStatusAccent(task.status))}
    >
      <div className="flex items-center gap-1.5">
        {typeLabel && (
          <span className="shrink-0 rounded bg-muted/50 px-1 py-px text-[10px] text-muted-foreground/60">
            {typeLabel}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-foreground/80">
          {task.description}
        </span>
        {meta && <span className="shrink-0 text-[10px] text-muted-foreground/40">{meta}</span>}
      </div>
      {activityLine && (
        <p
          className={cn(
            "truncate text-[10px] leading-4",
            isRunning ? "text-amber-400/70" : "text-muted-foreground/50",
          )}
        >
          {isRunning && (
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-amber-400/80 align-middle" />
          )}
          {activityLine}
        </p>
      )}
    </div>
  );
});

const AgentGroupRow = memo(function AgentGroupRow(props: {
  agentGroup: AgentGroup;
  label: string;
}) {
  const { agentGroup, label } = props;
  const [expanded, setExpanded] = useState(false);
  const tasks = agentGroup.tasks;
  const allSettled = tasks.every(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "stopped",
  );

  const ExpandIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div className="rounded-lg px-1 py-1">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left transition-colors duration-150 hover:bg-muted/20"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          {allSettled ? (
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          ) : (
            <span className="size-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
          )}
          <span className="sr-only">{allSettled ? "Finished" : "In progress"}</span>
        </span>
        <span className="flex-1 truncate text-[11px] leading-5 text-foreground/80">{label}</span>
        <ExpandIcon className="size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 pl-5">
          {tasks.map((task) => (
            <AgentTaskRow key={task.taskId} task={task} />
          ))}
        </div>
      )}
    </div>
  );
});

const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: {
  workEntry: TimelineWorkEntry;
  showInlineDiffs: boolean;
}) {
  const { workEntry, showInlineDiffs } = props;
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const preview = workEntryPreview(workEntry);
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const hasChangedFiles = (workEntry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !workEntry.command && !workEntry.detail;

  const hasDiffPreviews = (workEntry.diffPreviews?.length ?? 0) > 0;
  const shouldShowDiffs = showInlineDiffs && hasDiffPreviews;

  return (
    <div className="rounded-lg px-1 py-1">
      <div className="flex items-center gap-2 transition-[opacity,translate] duration-200">
        <span
          className={cn("flex size-5 shrink-0 items-center justify-center", iconConfig.className)}
        >
          <EntryIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn(
              "truncate text-[11px] leading-5",
              workToneClass(workEntry.tone),
              preview ? "text-muted-foreground/70" : "",
            )}
            title={displayText}
          >
            <span className={cn("text-foreground/80", workToneClass(workEntry.tone))}>
              {heading}
            </span>
            {preview && <span className="text-muted-foreground/55"> - {preview}</span>}
          </p>
        </div>
      </div>
      {shouldShowDiffs ? (
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
              <span
                key={`${workEntry.id}:${filePath}`}
                className="rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75"
                title={filePath}
              >
                {filePath}
              </span>
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
