import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CircleXIcon, TerminalIcon } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";

interface CommandExecutionCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
}

type CommandStatus = "running" | "error" | "success";

const PREVIEW_MAX_HEIGHT = "120px";

function deriveCommandStatus(entry: WorkLogEntry, isLive: boolean): CommandStatus {
  if (isLive && !entry.detail && entry.exitCode === undefined) return "running";
  if (entry.tone === "error" || (entry.exitCode !== undefined && entry.exitCode !== 0))
    return "error";
  return "success";
}

const DETAIL_COMMAND_PREFIX_RE = /^(?:Bash|Shell|Sh):\s*/i;

function deriveCommandAndOutput(entry: WorkLogEntry): {
  displayCommand: string | null;
  output: string | null;
} {
  if (entry.command) {
    return { displayCommand: entry.command, output: entry.detail ?? null };
  }
  if (entry.detail) {
    const firstNewline = entry.detail.indexOf("\n");
    const firstLine = firstNewline === -1 ? entry.detail : entry.detail.slice(0, firstNewline);
    if (DETAIL_COMMAND_PREFIX_RE.test(firstLine)) {
      const cmd = firstLine.replace(DETAIL_COMMAND_PREFIX_RE, "").trim();
      const rest = firstNewline === -1 ? null : entry.detail.slice(firstNewline + 1).trim() || null;
      return { displayCommand: cmd || null, output: rest };
    }
  }
  return { displayCommand: null, output: entry.detail ?? null };
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
  const [previewOverflows, setPreviewOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const status = deriveCommandStatus(entry, isLive);
  const { displayCommand, output } = useMemo(() => deriveCommandAndOutput(entry), [entry]);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el || expanded) return;
    setPreviewOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [expanded, output]);

  const hasMoreContent = expanded || previewOverflows;
  const ExpandIcon = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        STATUS_ACCENT[status],
      )}
    >
      <Tooltip>
        <TooltipTrigger render={<div className="flex items-center gap-2 px-3 py-1.5" />}>
          <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
          {displayCommand ? (
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
              {displayCommand}
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-[11px] text-muted-foreground/60">
              {entry.label}
            </span>
          )}
          <CommandStatusBadge entry={entry} status={status} />
        </TooltipTrigger>
        {displayCommand && (
          <TooltipPopup side="top" className="max-w-lg">
            <p className="break-all font-mono text-xs">{displayCommand}</p>
          </TooltipPopup>
        )}
      </Tooltip>

      {output && !expanded && (
        <div
          ref={previewRef}
          className="relative overflow-hidden border-t border-border/20"
          style={{ maxHeight: PREVIEW_MAX_HEIGHT }}
        >
          <pre className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
            {output}
          </pre>
          {previewOverflows && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card/90 to-transparent" />
          )}
        </div>
      )}

      {output && expanded && (
        <div className="border-t border-border/20">
          <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
            {output}
          </pre>
        </div>
      )}

      {hasMoreContent && (
        <button
          type="button"
          data-scroll-anchor-ignore
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/30 py-1.5 text-[10px] text-muted-foreground/50 transition-colors hover:bg-muted/20 hover:text-muted-foreground/70"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <ExpandIcon className="size-3" />
          <span>{expanded ? "Hide output" : "Show full output"}</span>
        </button>
      )}
    </div>
  );
});
