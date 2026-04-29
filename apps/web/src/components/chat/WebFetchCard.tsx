import { memo, useMemo } from "react";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";
import { ToolCard } from "./_shared/ToolCard";
import type { ToolStatusKind } from "./_shared/StatusBadge";

interface WebFetchCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
}

const HTTP_ERROR_PATTERN = /^Request failed with status code \d{3}/;

function deriveToolStatus(entry: WorkLogEntry): ToolStatusKind {
  if (entry.toolCompleted) {
    if (entry.tone === "error") return "error";
    if (entry.detail && HTTP_ERROR_PATTERN.test(entry.detail.trim())) return "error";
    return "success";
  }
  return "running";
}

function deriveUrl(entry: WorkLogEntry): string | null {
  const input = entry.toolInput;
  if (input) {
    for (const key of ["url", "uri", "link", "target", "href", "endpoint", "address"] as const) {
      const value = input[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  if (entry.detail) {
    const trimmed = entry.detail.trim();
    if (/^https?:\/\//.test(trimmed)) {
      return trimmed.split(/\s/)[0] ?? null;
    }
    const xmlMatch = trimmed.match(/<(?:url|uri|link)>(https?:\/\/[^<\s]+)<\/(?:url|uri|link)>/i);
    if (xmlMatch?.[1]) return xmlMatch[1];
    const inline = trimmed.match(/https?:\/\/[^\s"'<>)]+/);
    if (inline) return inline[0];
  }
  return null;
}

function formatUrlDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const display = `${parsed.hostname}${parsed.pathname.length > 1 ? parsed.pathname : ""}`;
    return display.length > 70 ? display.slice(0, 67) + "..." : display;
  } catch {
    return url.length > 70 ? url.slice(0, 67) + "..." : url;
  }
}

export const WebFetchCard = memo(function WebFetchCard(props: WebFetchCardProps) {
  const { entry } = props;

  const status = deriveToolStatus(entry);
  const url = useMemo(() => deriveUrl(entry), [entry]);
  const urlDisplay = useMemo(() => (url ? formatUrlDisplay(url) : null), [url]);
  const meaningfulDetail = useMemo(() => {
    if (!entry.detail) return null;
    const trimmed = entry.detail.trim();
    if (url && trimmed === url) return null;
    return entry.detail;
  }, [entry.detail, url]);
  const renderedOutput = useMemo(
    () => (meaningfulDetail ? ansiToSpans(meaningfulDetail) : null),
    [meaningfulDetail],
  );

  const primaryText = urlDisplay ?? entry.toolTitle ?? entry.label;

  const primary = url ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="block min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {primaryText}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-lg">
        <p className="break-all font-mono text-xs">{url}</p>
      </TooltipPopup>
    </Tooltip>
  ) : (
    <span className="block min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60">
      {primaryText}
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
      tool="web"
      status={status}
      primary={primary}
      preview={previewBody}
      expanded={expandedBody}
      defaultState="collapsed"
      statusLabels={{ running: "Fetching", success: "Fetched", error: "Failed" }}
    />
  );
});
