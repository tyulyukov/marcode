import { memo, useMemo } from "react";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";
import { ToolCard } from "./_shared/ToolCard";
import type { ToolStatusKind } from "./_shared/StatusBadge";

interface WebSearchCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
  isLatestTurn?: boolean;
}

function deriveToolStatus(entry: WorkLogEntry): ToolStatusKind {
  if (entry.toolCompleted) {
    if (entry.tone === "error") return "error";
    return "success";
  }
  return "running";
}

function deriveSearchQuery(entry: WorkLogEntry): string | null {
  const input = entry.toolInput;
  if (input) {
    const q =
      typeof input.query === "string"
        ? input.query.trim()
        : typeof input.q === "string"
          ? input.q.trim()
          : null;
    if (q && q.length > 0) return q;
  }
  if (entry.detail) {
    const match = entry.detail.match(/^"(.+?)"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export const WebSearchCard = memo(function WebSearchCard(props: WebSearchCardProps) {
  const { entry, isLatestTurn = false } = props;

  const status = deriveToolStatus(entry);
  const query = useMemo(() => deriveSearchQuery(entry), [entry]);
  const renderedOutput = useMemo(
    () => (entry.detail ? ansiToSpans(entry.detail) : null),
    [entry.detail],
  );

  const headerText = query ? `Searched for "${query}"` : (entry.toolTitle ?? entry.label);

  const primary = query ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="block min-w-0 flex-1 truncate text-[11px] text-foreground/80">
            {headerText}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-lg">
        <p className="break-all text-xs">{headerText}</p>
      </TooltipPopup>
    </Tooltip>
  ) : (
    <span className="block min-w-0 flex-1 truncate text-[11px] text-foreground/80">
      {headerText}
    </span>
  );

  const body = renderedOutput ? (
    <pre className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
      {renderedOutput}
    </pre>
  ) : null;

  return (
    <ToolCard
      tool="web"
      status={status}
      primary={primary}
      body={body}
      defaultState={isLatestTurn ? "preview" : "collapsed"}
      statusLabels={{ running: "Searching", success: "Done", error: "Failed" }}
    />
  );
});
