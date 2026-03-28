import { memo } from "react";
import { type AgentTaskSummary, formatTokenCount, formatToolUseCount } from "../../session-logic";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import { cn } from "~/lib/utils";

function formatAgentTaskType(taskType: string | null): string | null {
  if (!taskType) return null;
  const normalized = taskType.trim().toLowerCase();
  if (normalized === "default" || normalized.length === 0) return null;
  return normalized
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function agentTaskStatusLabel(status: AgentTaskSummary["status"]): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
  }
}

export function agentTaskStatusClass(status: AgentTaskSummary["status"]): string {
  switch (status) {
    case "running":
      return "border-l-primary/70";
    case "failed":
      return "border-l-rose-400/70";
    case "completed":
      return "border-l-success/70";
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

export const AgentTaskRow = memo(function AgentTaskRow(props: { task: AgentTaskSummary }) {
  const { task } = props;
  const typeLabel = formatAgentTaskType(task.agentType);
  const isRunning = task.status === "running";
  const activityLine = agentTaskActivityLine(task);
  const meta = agentTaskMeta(task);

  return (
    <div
      className={cn("rounded-md border-l-2 py-1 pl-2.5 pr-1.5", agentTaskStatusClass(task.status))}
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
            isRunning ? "text-primary/70" : "text-muted-foreground/50",
          )}
        >
          {isRunning && (
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-primary/80 align-middle" />
          )}
          {activityLine}
        </p>
      )}
    </div>
  );
});
