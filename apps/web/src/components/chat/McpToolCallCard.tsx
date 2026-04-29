import { memo, useMemo } from "react";
import { ansiToSpans } from "~/lib/ansiToSpans";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { WorkLogEntry } from "../../session-logic";
import { ToolCard } from "./_shared/ToolCard";
import type { ToolStatusKind } from "./_shared/StatusBadge";

interface McpToolCallCardProps {
  entry: WorkLogEntry;
  isLive: boolean;
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

function humanizeMcpSegment(value: string, stripClaudePrefix: boolean): string {
  const base = stripClaudePrefix ? value.replace(CLAUDE_AI_PREFIX_RE, "") : value;
  return base.replace(/_/g, " ");
}

function parseMcpToolName(entry: WorkLogEntry): ParsedMcpToolName {
  const input = entry.toolInput;
  const structuredServer = input && typeof input.server === "string" ? input.server.trim() : null;
  const structuredTool = input && typeof input.tool === "string" ? input.tool.trim() : null;
  if (structuredServer && structuredTool) {
    return {
      serverName: humanizeMcpSegment(structuredServer, CLAUDE_AI_PREFIX_RE.test(structuredServer)),
      functionName: humanizeMcpSegment(structuredTool, false),
    };
  }

  const toolName = entry.toolName;
  if (!toolName) return { serverName: null, functionName: "Unknown" };
  const match = toolName.match(MCP_TOOL_NAME_RE);
  if (match) {
    const rawServer = match[1]!;
    const rawFunction = match[2]!;
    return {
      serverName: humanizeMcpSegment(rawServer, CLAUDE_AI_PREFIX_RE.test(rawServer)),
      functionName: humanizeMcpSegment(rawFunction, false),
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

export const McpToolCallCard = memo(function McpToolCallCard(props: McpToolCallCardProps) {
  const { entry } = props;

  const status = deriveToolStatus(entry);
  const parsed = useMemo(() => parseMcpToolName(entry), [entry.toolName, entry.toolInput]);
  const inputSummary = useMemo(() => summarizeInput(entry.toolInput), [entry.toolInput]);
  const renderedOutput = useMemo(
    () => (entry.detail ? ansiToSpans(entry.detail) : null),
    [entry.detail],
  );

  const primary = (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="block min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {parsed.functionName}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-lg">
        <p className="break-all text-xs">{entry.toolName ?? parsed.functionName}</p>
      </TooltipPopup>
    </Tooltip>
  );

  const meta = inputSummary ? (
    <span className="hidden max-w-[40%] shrink-0 truncate font-mono text-[10px] text-muted-foreground/45 md:inline">
      {inputSummary}
    </span>
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
      defaultState="collapsed"
      statusLabels={{ running: "Running", success: "Done", error: "Failed" }}
    />
  );
});
