import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CircleXIcon, WrenchIcon } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";

interface McpToolCallCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
}

type ToolStatus = "running" | "error" | "success";

const PREVIEW_MAX_HEIGHT_PX = 120;
const MIN_OVERFLOW_PX = 24;

function deriveToolStatus(entry: WorkLogEntry): ToolStatus {
  if (entry.toolCompleted) {
    if (entry.tone === "error") return "error";
    return "success";
  }
  return "running";
}

const STATUS_ACCENT: Record<ToolStatus, string> = {
  running: "border-l-violet-400/40",
  error: "border-l-rose-400/40",
  success: "border-l-violet-400/20",
};

interface ParsedMcpToolName {
  serverName: string | null;
  functionName: string;
}

const MCP_TOOL_NAME_RE = /^mcp__(.+?)__(.+)$/;
const CLAUDE_AI_PREFIX_RE = /^claude_ai_/;

function parseMcpToolName(toolName: string | undefined): ParsedMcpToolName {
  if (!toolName) return { serverName: null, functionName: "Unknown" };
  const match = MCP_TOOL_NAME_RE.exec(toolName);
  if (match) {
    const rawServer = match[1]!;
    const rawFunction = match[2]!;
    const serverDisplay = CLAUDE_AI_PREFIX_RE.test(rawServer)
      ? rawServer.replace(CLAUDE_AI_PREFIX_RE, "").replace(/_/g, " ")
      : rawServer.replace(/_/g, " ");
    return {
      serverName: serverDisplay,
      functionName: rawFunction.replace(/_/g, " "),
    };
  }
  return { serverName: null, functionName: toolName };
}

const MAX_INPUT_PAIRS = 3;
const MAX_VALUE_LEN = 50;

function summarizeInput(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const keys = Object.keys(input);
  if (keys.length === 0) return null;
  const pairs = keys.slice(0, MAX_INPUT_PAIRS).map((key) => {
    const value = input[key];
    const valStr =
      typeof value === "string"
        ? value.length > MAX_VALUE_LEN
          ? value.slice(0, MAX_VALUE_LEN - 3) + "..."
          : value
        : (JSON.stringify(value)?.slice(0, MAX_VALUE_LEN) ?? "");
    return `${key}: ${valStr}`;
  });
  const summary = pairs.join(", ");
  return keys.length > MAX_INPUT_PAIRS ? summary + ", ..." : summary;
}

function StatusBadge(props: { status: ToolStatus }) {
  const { status } = props;

  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-violet-400/70">
        <span className="size-1.5 animate-pulse rounded-full bg-violet-400/80" />
        Running
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
      Done
    </span>
  );
}

export const McpToolCallCard = memo(function McpToolCallCard(props: McpToolCallCardProps) {
  const { entry } = props;
  const [expanded, setExpanded] = useState(false);
  const [previewOverflows, setPreviewOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const status = deriveToolStatus(entry);
  const parsed = useMemo(() => parseMcpToolName(entry.toolName), [entry.toolName]);
  const inputSummary = useMemo(() => summarizeInput(entry.toolInput), [entry.toolInput]);
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
          <WrenchIcon className="size-3.5 shrink-0 text-violet-400/60" />
          {parsed.serverName && (
            <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-px text-[10px] text-violet-300/80">
              {parsed.serverName}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">
            {parsed.functionName}
          </span>
          <StatusBadge status={status} />
        </TooltipTrigger>
        <TooltipPopup side="top" className="max-w-lg">
          <p className="break-all text-xs">{entry.toolName ?? parsed.functionName}</p>
        </TooltipPopup>
      </Tooltip>

      {inputSummary && (
        <div className="border-t border-border/10 px-3 py-1">
          <p className="truncate font-mono text-[10px] leading-4 text-muted-foreground/45">
            {inputSummary}
          </p>
        </div>
      )}

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
          <span>{expanded ? "Hide result" : "Show full result"}</span>
        </button>
      )}
    </div>
  );
});
