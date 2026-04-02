import { BotIcon } from "lucide-react";
import { memo } from "react";
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
  const tasks = agentGroup.tasks;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        isLive ? "border-l-violet-400/40" : "border-l-violet-400/20",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <BotIcon className="size-3.5 shrink-0 text-violet-400/60" />
        <span className="min-w-0 flex-1 truncate text-[11px] leading-5 text-foreground/80">
          {label}
        </span>
      </div>

      <div className="space-y-1 border-t border-border/20 px-2 py-1.5">
        {tasks.map((task) => (
          <AgentTaskRow key={task.taskId} task={task} />
        ))}
      </div>
    </div>
  );
});
