import { memo, useMemo } from "react";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";
import { ToolCard } from "./_shared/ToolCard";
import type { ToolStatusKind } from "./_shared/StatusBadge";

interface McpToolCallCardProps {
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

interface ParsedMcpToolName {
  serverName: string | null;
  functionName: string;
}

const MCP_TOOL_NAME_RE = /^mcp__(.+?)__(.+)$/;
const CLAUDE_AI_PREFIX_RE = /^claude_ai_/;

function titleCaseMcpServerWord(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "mcp") return "MCP";
  if (lower === "ai") return "AI";
  if (lower === "devtools") return "DevTools";
  if (/^[a-z]+\d+$/iu.test(value)) return value.slice(0, 1).toUpperCase() + value.slice(1);
  return lower.slice(0, 1).toUpperCase() + lower.slice(1);
}

function humanizeMcpServerName(value: string): string {
  const withoutClaudePrefix = value.replace(CLAUDE_AI_PREFIX_RE, "");
  const withoutPluginPrefix = withoutClaudePrefix.replace(/^plugin[_-]/u, "");
  const parts = withoutPluginPrefix.split(/[-_\s]+/u).filter(Boolean);
  const dedupedParts = parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
  return dedupedParts.map(titleCaseMcpServerWord).join(" ");
}

function humanizeMcpFunctionName(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function parseMcpToolName(entry: WorkLogEntry): ParsedMcpToolName {
  const structuredServer = entry.toolServerName?.trim() ?? null;
  const structuredTool = entry.toolFunctionName?.trim() ?? null;
  if (structuredServer && structuredTool) {
    return {
      serverName: humanizeMcpServerName(structuredServer),
      functionName: humanizeMcpFunctionName(structuredTool),
    };
  }

  const toolName = entry.toolName;
  if (!toolName) return { serverName: null, functionName: "Unknown" };
  const match = toolName.match(MCP_TOOL_NAME_RE);
  if (match) {
    const rawServer = match[1]!;
    const rawFunction = match[2]!;
    return {
      serverName: humanizeMcpServerName(rawServer),
      functionName: humanizeMcpFunctionName(rawFunction),
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

function formatInputTooltip(input: Record<string, unknown> | undefined): string | null {
  if (!input || Object.keys(input).length === 0) return null;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export const McpToolCallCard = memo(function McpToolCallCard(props: McpToolCallCardProps) {
  const { entry, isLatestTurn = false } = props;

  const status = deriveToolStatus(entry);
  const { toolName } = entry;
  const parsed = useMemo(() => parseMcpToolName(entry), [entry]);
  const inputSummary = useMemo(() => summarizeInput(entry.toolInput), [entry.toolInput]);
  const inputTooltip = useMemo(() => formatInputTooltip(entry.toolInput), [entry.toolInput]);
  const renderedOutput = useMemo(
    () => (entry.detail ? ansiToSpans(entry.detail) : null),
    [entry.detail],
  );

  const primary = (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="block min-w-0 flex-1 truncate text-[11px] text-foreground/80">
            {parsed.serverName ? (
              <>
                <span className="font-medium">{parsed.serverName}</span>
                <span className="px-1.5 text-muted-foreground/45">/</span>
                <span className="font-mono">{parsed.functionName}</span>
              </>
            ) : (
              <span className="font-mono">{parsed.functionName}</span>
            )}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-xl">
        <div className="space-y-2 text-xs">
          <p className="break-all font-mono">{toolName ?? parsed.functionName}</p>
          {inputTooltip ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
              {inputTooltip}
            </pre>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );

  const meta = inputSummary ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="hidden max-w-[40%] shrink-0 truncate font-mono text-[10px] text-muted-foreground/45 md:inline">
            {inputSummary}
          </span>
        }
      />
      {inputTooltip ? (
        <TooltipPopup side="top" className="max-w-xl">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
            {inputTooltip}
          </pre>
        </TooltipPopup>
      ) : null}
    </Tooltip>
  ) : null;

  const body = renderedOutput ? (
    <pre className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground/55">
      {renderedOutput}
    </pre>
  ) : null;

  return (
    <ToolCard
      tool="mcp"
      status={status}
      primary={primary}
      meta={meta}
      body={body}
      defaultState={isLatestTurn ? "preview" : "collapsed"}
      statusLabels={{ running: "Running", success: "Done", error: "Failed" }}
    />
  );
});
