import { memo, useMemo } from "react";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";
import { useRuntimeToolOutput } from "../../runtimeToolOutputStore";
import { ToolCard } from "./_shared/ToolCard";
import type { ToolStatusKind } from "./_shared/StatusBadge";

interface CommandExecutionCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
  threadId: string;
  isPendingApproval?: boolean;
}

type CommandStatus = "running" | "error" | "success" | "approval";

function deriveCommandStatus(entry: WorkLogEntry, isPendingApproval: boolean): CommandStatus {
  if (entry.toolCompleted || entry.exitCode !== undefined) {
    if (entry.tone === "error" || (entry.exitCode !== undefined && entry.exitCode !== 0))
      return "error";
    return "success";
  }
  if (isPendingApproval) return "approval";
  return "running";
}

const DETAIL_COMMAND_PREFIX_RE = /^(?:Bash|Shell|Sh|Read|Edit|Write|Grep|Glob):\s*/i;
const PLACEHOLDER_JSON_RE = /^\{[\s"{}]*\}$/;

function deriveCommandAndOutput(entry: WorkLogEntry): {
  displayCommand: string | null;
  output: string | null;
} {
  if (entry.command) {
    const output = detailIsDistinctOutput(entry.detail, entry.command, entry.rawCommand)
      ? (entry.detail ?? null)
      : null;
    return { displayCommand: entry.command, output };
  }
  if (entry.detail) {
    const firstNewline = entry.detail.indexOf("\n");
    const firstLine = firstNewline === -1 ? entry.detail : entry.detail.slice(0, firstNewline);
    if (DETAIL_COMMAND_PREFIX_RE.test(firstLine)) {
      const cmd = firstLine.replace(DETAIL_COMMAND_PREFIX_RE, "").trim();
      if (cmd && !isPlaceholderJson(cmd)) {
        const rest =
          firstNewline === -1 ? null : entry.detail.slice(firstNewline + 1).trim() || null;
        return { displayCommand: cmd, output: rest };
      }
    }
  }
  const fallbackOutput = entry.detail ?? null;
  if (fallbackOutput) {
    const stripped = fallbackOutput.replace(DETAIL_COMMAND_PREFIX_RE, "").trim();
    if (isPlaceholderJson(stripped)) {
      return { displayCommand: null, output: null };
    }
  }
  return { displayCommand: null, output: fallbackOutput };
}

function isPlaceholderJson(value: string): boolean {
  return PLACEHOLDER_JSON_RE.test(value);
}

const SHELL_WRAPPER_RE = /^\/(?:bin|usr\/bin|nix\/store\/[^/]+\/bin)\/(?:bash|zsh|sh|dash|fish)\s/;

function detailIsDistinctOutput(
  detail: string | undefined,
  command: string,
  rawCommand: string | undefined,
): boolean {
  if (!detail || detail.length === 0) return false;
  const stripped = detail.replace(DETAIL_COMMAND_PREFIX_RE, "").trim();
  if (stripped === command.trim()) return false;
  if (rawCommand && stripped === rawCommand.trim()) return false;
  if (stripped.startsWith("{") && stripped.includes(command.slice(0, 20))) return false;
  if (SHELL_WRAPPER_RE.test(stripped)) return false;
  return true;
}

function statusToToolStatus(status: CommandStatus): ToolStatusKind {
  if (status === "approval") return "approval";
  if (status === "running") return "running";
  if (status === "error") return "error";
  return "success";
}

export const CommandExecutionCard = memo(function CommandExecutionCard(
  props: CommandExecutionCardProps,
) {
  const { entry, threadId, isPendingApproval = false } = props;

  const status = deriveCommandStatus(entry, isPendingApproval);
  const liveOutput = useRuntimeToolOutput(threadId, entry.itemId);
  const { displayCommand, output } = useMemo(() => deriveCommandAndOutput(entry), [entry]);
  const effectiveOutput = liveOutput ?? output;
  const renderedOutput = useMemo(
    () => (effectiveOutput ? ansiToSpans(effectiveOutput) : null),
    [effectiveOutput],
  );

  if (!displayCommand && !renderedOutput && status === "running") {
    return null;
  }

  const errorLabel =
    entry.exitCode !== undefined && entry.exitCode !== 0 ? `Exit ${entry.exitCode}` : "Failed";

  const primary = displayCommand ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="block min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {displayCommand}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-lg">
        <p className="break-all font-mono text-xs">{displayCommand}</p>
      </TooltipPopup>
    </Tooltip>
  ) : (
    <span className="block min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60">
      {entry.label}
    </span>
  );

  const previewBody = renderedOutput ? (
    <div className="relative overflow-hidden" style={{ maxHeight: "120px" }}>
      <pre className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
        {renderedOutput}
      </pre>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card/90 to-transparent" />
    </div>
  ) : null;

  const expandedBody = renderedOutput ? (
    <pre className="overflow-y-auto whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
      {renderedOutput}
    </pre>
  ) : null;

  return (
    <ToolCard
      tool="bash"
      status={statusToToolStatus(status)}
      primary={primary}
      preview={previewBody}
      expanded={expandedBody}
      defaultState="preview"
      isPendingApproval={isPendingApproval}
      statusLabels={{ running: "Running", success: "Success", error: errorLabel }}
    />
  );
});
