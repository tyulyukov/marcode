import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CircleXIcon, GlobeIcon } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";

interface WebFetchCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
}

type ToolStatus = "running" | "error" | "success";

const PREVIEW_MAX_HEIGHT_PX = 120;
const MIN_OVERFLOW_PX = 24;

function deriveToolStatus(entry: WorkLogEntry, isLive: boolean): ToolStatus {
  if (entry.toolCompleted) {
    return entry.tone === "error" ? "error" : "success";
  }
  if (isLive) return "running";
  return "success";
}

const STATUS_ACCENT: Record<ToolStatus, string> = {
  running: "border-l-cyan-400/40",
  error: "border-l-rose-400/40",
  success: "border-l-cyan-400/20",
};

function deriveUrl(entry: WorkLogEntry): string | null {
  const input = entry.toolInput;
  if (input && typeof input.url === "string" && input.url.trim().length > 0) {
    return input.url.trim();
  }
  if (entry.detail && /^https?:\/\//.test(entry.detail.trim())) {
    return entry.detail.trim().split(/\s/)[0] ?? null;
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

function StatusBadge(props: { status: ToolStatus }) {
  const { status } = props;

  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-cyan-400/70">
        <span className="size-1.5 animate-pulse rounded-full bg-cyan-400/80" />
        Fetching
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-rose-400/60">
        <CircleXIcon className="size-3" />
        Failed
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
      <CheckIcon className="size-3" />
      Fetched
    </span>
  );
}

export const WebFetchCard = memo(function WebFetchCard(props: WebFetchCardProps) {
  const { entry, isLive } = props;
  const [expanded, setExpanded] = useState(false);
  const [previewOverflows, setPreviewOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const status = deriveToolStatus(entry, isLive);
  const url = useMemo(() => deriveUrl(entry), [entry]);
  const urlDisplay = useMemo(() => (url ? formatUrlDisplay(url) : null), [url]);
  const renderedOutput = useMemo(
    () => (entry.detail ? ansiToSpans(entry.detail) : null),
    [entry.detail],
  );

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el || expanded) return;
    setPreviewOverflows(el.scrollHeight > el.clientHeight + MIN_OVERFLOW_PX);
  }, [expanded, entry.detail]);

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
          <GlobeIcon className="size-3.5 shrink-0 text-cyan-400/60" />
          {urlDisplay ? (
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
              {urlDisplay}
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-[11px] text-muted-foreground/60">
              {entry.toolTitle ?? entry.label}
            </span>
          )}
          <StatusBadge status={status} />
        </TooltipTrigger>
        {url && (
          <TooltipPopup side="top" className="max-w-lg">
            <p className="break-all font-mono text-xs">{url}</p>
          </TooltipPopup>
        )}
      </Tooltip>

      {renderedOutput && !expanded && (
        <div
          ref={previewRef}
          className="relative overflow-hidden border-t border-border/20"
          style={{ maxHeight: `${PREVIEW_MAX_HEIGHT_PX}px` }}
        >
          <pre className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
            {renderedOutput}
          </pre>
          {previewOverflows && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card/90 to-transparent" />
          )}
        </div>
      )}

      {renderedOutput && expanded && (
        <div className="border-t border-border/20">
          <pre className="overflow-y-auto whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
            {renderedOutput}
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
          <span>{expanded ? "Hide response" : "Show full response"}</span>
        </button>
      )}
    </div>
  );
});
