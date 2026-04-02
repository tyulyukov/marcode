import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { memo, useState } from "react";
import {
  formatTokenCount,
  formatToolUseCount,
  type AgentGroup,
  type AgentTaskSummary,
} from "../../session-logic";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface AgentGroupCardProps {
  agentGroup: AgentGroup;
  label: string;
  isLive: boolean;
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
  if (task.progressSummary) return task.progressSummary;
  if (task.lastToolName) return `Using ${normalizeCompactToolLabel(task.lastToolName)}`;
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
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-foreground/80">
                {task.description}
              </span>
            }
          />
          <TooltipPopup
            side="top"
            className="max-w-lg break-words whitespace-pre-wrap leading-tight"
          >
            {task.description}
          </TooltipPopup>
        </Tooltip>
        {meta && <span className="shrink-0 text-[10px] text-muted-foreground/40">{meta}</span>}
      </div>
      {activityLine && (
        <Tooltip>
          <TooltipTrigger
            render={
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
            }
          />
          <TooltipPopup
            side="top"
            className="max-w-lg break-words whitespace-pre-wrap leading-tight"
          >
            {activityLine}
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
});

export const AgentGroupCard = memo(function AgentGroupCard(props: AgentGroupCardProps) {
  const { agentGroup, label, isLive } = props;
  const [expanded, setExpanded] = useState(false);
  const tasks = agentGroup.tasks;
  const allSettled = tasks.every(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "stopped",
  );

  const ExpandIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        isLive ? "border-l-violet-400/40" : "border-l-violet-400/20",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100 hover:bg-muted/20"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ExpandIcon className="size-3 shrink-0 text-muted-foreground/50" />
        <span className="flex size-4 shrink-0 items-center justify-center">
          {allSettled ? (
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          ) : (
            <span className="size-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
          )}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-foreground/80">
                {label}
              </span>
            }
          />
          <TooltipPopup
            side="top"
            className="max-w-lg break-words whitespace-pre-wrap leading-tight"
          >
            {label}
          </TooltipPopup>
        </Tooltip>
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-border/20 px-2 py-1.5">
          {tasks.map((task) => (
            <AgentTaskRow key={task.taskId} task={task} />
          ))}
        </div>
      )}
    </div>
  );
});
