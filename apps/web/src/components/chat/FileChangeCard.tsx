import { parsePatchFiles, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { CheckIcon, CopyIcon, ReplyIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MessageId, type TurnId } from "@marcode/contracts";
import { useTheme } from "~/hooks/useTheme";
import { buildPatchCacheKey, resolveDiffThemeName } from "~/lib/diffRendering";
import { buildQuoteFromPierreFileDiff, inferLanguageFromFilePath } from "~/lib/diffLineQuote";
import { type InlineDiffHunk } from "~/lib/inlineDiff";
import type { QuotedContext } from "~/lib/quotedContext";
import { truncateQuotedText } from "~/lib/quotedContext";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn, randomUUID } from "~/lib/utils";
import { DiffStatSummary, OPERATION_LABELS, relativizePath } from "./InlineDiffPreview";
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

const INLINE_FILE_DIFF_SELECTION_SYNTHETIC_MESSAGE_ID = MessageId.make(
  "inline-file-diff-selection",
);

const FILE_CHANGE_CARD_DIFF_CSS = `
:host {
  --diffs-font-size: 11px;
  --diffs-line-height: 18px;
}

[data-diffs-header],
[data-file-info] {
  display: none !important;
}

[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 94%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-bg-context-override: color-mix(in srgb, var(--background) 98%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));
  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--destructive));
  background-color: var(--diffs-bg) !important;
}

pre,
code {
  background-color: transparent !important;
}

[data-code] {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
`;

function parseInlineHunkFileDiff(
  hunk: InlineDiffHunk,
  mode: "preview" | "full",
): FileDiffMetadata | null {
  const patch = mode === "preview" ? (hunk.previewPatch ?? hunk.patch) : hunk.patch;
  if (patch.trim().length === 0) return null;
  try {
    const parsed = parsePatchFiles(
      patch,
      buildPatchCacheKey(patch, `file-change-card:${hunk.filePath}:${mode}`),
    );
    return parsed.flatMap((patch) => patch.files)[0] ?? null;
  } catch {
    return null;
  }
}

function PierreDiffLinesBlock(props: {
  hunk: InlineDiffHunk;
  mode?: "preview" | "full";
  showTruncatedMarker?: boolean;
  turnId: TurnId | null;
  onReplyToSelection?: ((context: QuotedContext) => void) | undefined;
}) {
  const {
    hunk,
    mode = "full",
    showTruncatedMarker = hunk.truncated,
    turnId,
    onReplyToSelection,
  } = props;
  const { resolvedTheme } = useTheme();
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const fileDiff = useMemo(() => parseInlineHunkFileDiff(hunk, mode), [hunk, mode]);

  const quote = useMemo(() => {
    if (!fileDiff || !selectedRange) return null;
    return buildQuoteFromPierreFileDiff({
      fileDiff,
      filePath: hunk.filePath,
      selection: selectedRange,
      mode: "unified",
    });
  }, [fileDiff, hunk.filePath, selectedRange]);

  const clearSelection = useCallback(() => setSelectedRange(null), []);

  const handleReply = useCallback(() => {
    if (!quote || !onReplyToSelection) return;
    const { text, wasTruncated } = truncateQuotedText(quote.text);
    if (wasTruncated) {
      console.warn("Quoted inline diff text was truncated to 5000 characters");
    }
    onReplyToSelection({
      id: randomUUID(),
      messageId: INLINE_FILE_DIFF_SELECTION_SYNTHETIC_MESSAGE_ID,
      turnId,
      source: "diff",
      text,
      codeLanguage: inferLanguageFromFilePath(hunk.filePath),
      filePath: hunk.filePath,
      lineStart: quote.lineStart,
      lineEnd: quote.lineEnd,
      selectionSide: quote.selectionSide,
    });
    clearSelection();
  }, [clearSelection, hunk.filePath, onReplyToSelection, quote, turnId]);

  const handleCopy = useCallback(() => {
    if (quote) {
      copyToClipboard(quote.text);
    }
  }, [copyToClipboard, quote]);

  useEffect(() => {
    if (!selectedRange) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        handleReply();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, handleReply, selectedRange]);

  if (!fileDiff) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden border-t border-border/30"
      data-file-change-card-diff
      data-inline-diff-line-selection
    >
      {quote && (
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {onReplyToSelection && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              onClick={handleReply}
              title="Reply to selected lines"
            >
              <ReplyIcon className="size-3" />
              Reply
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            onClick={handleCopy}
            title="Copy selected lines"
          >
            {isCopied ? (
              <CheckIcon className="size-3 text-success" />
            ) : (
              <CopyIcon className="size-3" />
            )}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            onClick={clearSelection}
            title="Clear selection"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}
      <FileDiff
        fileDiff={fileDiff}
        selectedLines={selectedRange}
        options={{
          disableFileHeader: true,
          disableLineNumbers: true,
          diffStyle: "unified",
          overflow: "scroll",
          hunkSeparators: "line-info-basic",
          lineDiffType: "word",
          theme: {
            dark: resolveDiffThemeName("dark"),
            light: resolveDiffThemeName("light"),
          },
          themeType: resolvedTheme,
          unsafeCSS: FILE_CHANGE_CARD_DIFF_CSS,
          enableLineSelection: true,
          lineHoverHighlight: "line",
          onLineSelectionEnd: setSelectedRange,
        }}
      />
      {showTruncatedMarker && (
        <div className="border-t border-border/30 px-2 py-0.5 text-center font-mono text-[10px] text-muted-foreground/40">
          ... diff truncated
        </div>
      )}
    </div>
  );
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
    <PierreDiffLinesBlock
      hunk={firstHunk}
      mode="preview"
      showTruncatedMarker={firstHunk.truncated}
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

  const expandedBody = isSingleHunk ? (
    firstHunk.truncated ? (
      <PierreDiffLinesBlock
        hunk={firstHunk}
        mode="full"
        showTruncatedMarker={false}
        turnId={turnId}
        onReplyToSelection={onReplyToSelection}
      />
    ) : undefined
  ) : (
    <div>
      {diffPreviews.map((hunk) => (
        <div key={hunk.filePath}>
          <div className="border-t border-border/20 px-3 py-1">
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {relativizePath(hunk.filePath, cwd)}
            </span>
          </div>
          <PierreDiffLinesBlock
            hunk={hunk}
            mode="full"
            showTruncatedMarker={false}
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
