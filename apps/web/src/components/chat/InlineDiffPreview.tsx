import { memo, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { type DiffLine, type InlineDiffHunk, diffStats } from "~/lib/inlineDiff";
import { cn } from "~/lib/utils";

const MAX_VISIBLE_HEIGHT_PX = 260;

function formatSummary(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(", ");
}

function shortenPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-2).join("/")}`;
}

function buildLineKeys(lines: ReadonlyArray<DiffLine>): string[] {
  const counters = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.type}:${line.content}`;
    const count = counters.get(base) ?? 0;
    counters.set(base, count + 1);
    return `${base}:${count}`;
  });
}

const OPERATION_LABELS: Record<InlineDiffHunk["operation"], string> = {
  edit: "Edit",
  write: "Write",
};

export const InlineDiffPreview = memo(function InlineDiffPreview(props: { hunk: InlineDiffHunk }) {
  const { hunk } = props;
  const [collapsed, setCollapsed] = useState(false);
  const stats = diffStats(hunk.lines);
  const summary = formatSummary(stats.additions, stats.deletions);
  const keyedLines = useMemo(() => {
    const keys = buildLineKeys(hunk.lines);
    return hunk.lines.map((line, i) => ({ ...line, key: keys[i]! }));
  }, [hunk.lines]);
  const CollapseIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-border/40 bg-background/60">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/30"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <CollapseIcon className="size-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate font-mono text-[10px] text-muted-foreground/70">
          {OPERATION_LABELS[hunk.operation]}({shortenPath(hunk.filePath)})
        </span>
        {summary && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/50">
            {summary}
          </span>
        )}
      </button>

      {!collapsed && (
        <div
          className="relative overflow-hidden border-t border-border/30"
          style={{ maxHeight: MAX_VISIBLE_HEIGHT_PX }}
        >
          <div className="overflow-x-auto">
            <pre className="text-[11px] leading-[18px]">
              {keyedLines.map((line) => (
                <div
                  key={line.key}
                  className={cn(
                    "pr-3 pl-1",
                    line.type === "deletion" &&
                      "bg-[color-mix(in_srgb,var(--background)_88%,var(--destructive))] text-[color-mix(in_srgb,var(--foreground)_70%,var(--destructive))]",
                    line.type === "addition" &&
                      "bg-[color-mix(in_srgb,var(--background)_88%,var(--success))] text-[color-mix(in_srgb,var(--foreground)_70%,var(--success))]",
                    line.type === "context" && "text-muted-foreground/60",
                  )}
                >
                  <span className="mr-2 inline-block w-3 select-none text-center text-muted-foreground/40">
                    {line.type === "deletion" ? "-" : line.type === "addition" ? "+" : " "}
                  </span>
                  {line.content}
                </div>
              ))}
            </pre>
          </div>

          {hunk.truncated && (
            <div className="border-t border-border/30 px-2 py-0.5 text-center font-mono text-[10px] text-muted-foreground/40">
              ... diff truncated
            </div>
          )}

          {!hunk.truncated && hunk.lines.length * 18 > MAX_VISIBLE_HEIGHT_PX && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/80 to-transparent" />
          )}
        </div>
      )}
    </div>
  );
});
