import { memo } from "react";
import type { TurnId } from "@marcode/contracts";
import { type InlineDiffHunk } from "~/lib/inlineDiff";
import type { QuotedContext } from "~/lib/quotedContext";
import { cn } from "~/lib/utils";
import {
  DiffLinesBlock,
  DiffStatSummary,
  OPERATION_LABELS,
  relativizePath,
} from "./InlineDiffPreview";
import { ToolCard } from "./_shared/ToolCard";

interface FileChangeCardProps {
  diffPreviews: ReadonlyArray<InlineDiffHunk>;
  cwd: string | undefined;
  isLive?: boolean;
  isPendingApproval?: boolean;
  isLatestTurn?: boolean;
  turnId?: TurnId | null;
  onReplyToSelection?: (context: QuotedContext) => void;
}

export const FileChangeCard = memo(function FileChangeCard(props: FileChangeCardProps) {
  const {
    diffPreviews,
    cwd,
    isPendingApproval = false,
    isLatestTurn = false,
    turnId = null,
    onReplyToSelection,
  } = props;

  if (diffPreviews.length === 0) return null;

  const totalAdditions = diffPreviews.reduce((sum, h) => sum + h.stats.additions, 0);
  const totalDeletions = diffPreviews.reduce((sum, h) => sum + h.stats.deletions, 0);
  const isSingleHunk = diffPreviews.length === 1;
  const firstHunk = diffPreviews[0]!;
  const isDelete = isSingleHunk && firstHunk.operation === "delete";

  const tool = isDelete ? "file-delete" : "file-edit";

  const primary = isSingleHunk ? (
    <span
      className={cn(
        "block min-w-0 flex-1 truncate font-mono text-[11px]",
        isDelete
          ? "text-foreground/60 line-through decoration-destructive/40"
          : "text-foreground/80",
      )}
    >
      {relativizePath(firstHunk.filePath, cwd)}
    </span>
  ) : (
    <span className="block min-w-0 flex-1 truncate text-[11px] text-foreground/80">
      {diffPreviews.length} files changed
    </span>
  );

  const meta = isSingleHunk ? (
    <>
      <span
        className={cn(
          "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
          isDelete
            ? "bg-destructive/10 text-destructive/80"
            : "bg-muted/40 text-muted-foreground/60",
        )}
      >
        {OPERATION_LABELS[firstHunk.operation]}
      </span>
      <DiffStatSummary
        additions={firstHunk.stats.additions}
        deletions={firstHunk.stats.deletions}
      />
    </>
  ) : (
    <DiffStatSummary additions={totalAdditions} deletions={totalDeletions} />
  );

  const body = isSingleHunk ? (
    <DiffLinesBlock
      filePath={firstHunk.filePath}
      lines={firstHunk.lines}
      truncated={firstHunk.truncated}
      turnId={turnId}
      onReplyToSelection={onReplyToSelection}
    />
  ) : (
    <div className="px-3 py-1">
      {diffPreviews.map((hunk) => (
        <div key={hunk.filePath} className="flex items-center gap-1.5 py-0.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/60">
            {relativizePath(hunk.filePath, cwd)}
          </span>
          <DiffStatSummary additions={hunk.stats.additions} deletions={hunk.stats.deletions} />
        </div>
      ))}
    </div>
  );

  const expandedBody = isSingleHunk ? undefined : (
    <div>
      {diffPreviews.map((hunk) => (
        <div key={hunk.filePath}>
          <div className="border-t border-border/20 px-3 py-1">
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {relativizePath(hunk.filePath, cwd)}
            </span>
          </div>
          <DiffLinesBlock
            filePath={hunk.filePath}
            lines={hunk.lines}
            truncated={hunk.truncated}
            turnId={turnId}
            onReplyToSelection={onReplyToSelection}
          />
        </div>
      ))}
    </div>
  );

  return (
    <ToolCard
      tool={tool}
      primary={primary}
      meta={meta}
      body={body}
      {...(expandedBody !== undefined ? { expandedBody } : {})}
      defaultState={isLatestTurn ? "preview" : "collapsed"}
      isPendingApproval={isPendingApproval}
    />
  );
});
