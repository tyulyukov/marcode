import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleXIcon,
  TerminalIcon,
} from "lucide-react";
import { memo, useState } from "react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";

interface CommandExecutionCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
}

type CommandStatus = "running" | "error" | "success";

function deriveCommandStatus(entry: WorkLogEntry, isLive: boolean): CommandStatus {
  if (isLive && !entry.detail && entry.exitCode === undefined) return "running";
  if (entry.tone === "error" || (entry.exitCode !== undefined && entry.exitCode !== 0))
    return "error";
  return "success";
}

const STATUS_ACCENT: Record<CommandStatus, string> = {
  running: "border-l-amber-400/40",
  error: "border-l-rose-400/40",
  success: "border-l-emerald-400/25",
};

function CommandStatusBadge(props: { entry: WorkLogEntry; status: CommandStatus }) {
  const { entry, status } = props;

  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-amber-400/70">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-400/80" />
        Running
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-rose-400/60">
        <CircleXIcon className="size-3" />
        {entry.exitCode !== undefined && entry.exitCode !== 0 ? `Exit ${entry.exitCode}` : "Failed"}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
      <CheckIcon className="size-3" />
      Success
    </span>
  );
}

export const CommandExecutionCard = memo(function CommandExecutionCard(
  props: CommandExecutionCardProps,
) {
  const { entry, isLive } = props;
  const [expanded, setExpanded] = useState(false);

  const status = deriveCommandStatus(entry, isLive);
  const hasOutput = !!entry.detail;

  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        STATUS_ACCENT[status],
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100 hover:bg-muted/20"
      >
        <ToggleIcon className="size-3 shrink-0 text-muted-foreground/50" />
        <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="text-[11px] font-medium text-muted-foreground/60">Shell</span>
        <span className="min-w-0 flex-1" />
        <CommandStatusBadge entry={entry} status={status} />
      </button>

      <div className="border-t border-border/20 px-3 py-1.5">
        {entry.command ? (
          <p className="font-mono text-[11px] leading-5 text-foreground/75">
            <span className="text-muted-foreground/50">$ </span>
            {entry.command}
          </p>
        ) : (
          <p className="text-[11px] leading-5 text-muted-foreground/60">{entry.label}</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border/20 px-3 py-2">
          {hasOutput ? (
            <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-muted-foreground/55">
              {entry.detail}
            </pre>
          ) : (
            <p className="text-[10px] italic text-muted-foreground/35">No output</p>
          )}
        </div>
      )}
    </div>
  );
});
