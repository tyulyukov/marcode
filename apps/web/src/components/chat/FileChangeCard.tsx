import { ChevronDownIcon, ChevronUpIcon, SquarePenIcon } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { type InlineDiffHunk } from "~/lib/inlineDiff";
import {
  DiffLinesBlock,
  DiffStatSummary,
  OPERATION_LABELS,
  shortenPath,
} from "./InlineDiffPreview";

const PREVIEW_MAX_HEIGHT = "120px";

interface FileChangeCardProps {
  diffPreviews: ReadonlyArray<InlineDiffHunk>;
}

function HunkHeader(props: { hunk: InlineDiffHunk }) {
  const { hunk } = props;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <SquarePenIcon className="size-3.5 shrink-0 text-primary/50" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
        {shortenPath(hunk.filePath)}
      </span>
      <span className="shrink-0 rounded-sm bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {OPERATION_LABELS[hunk.operation]}
      </span>
      <DiffStatSummary additions={hunk.stats.additions} deletions={hunk.stats.deletions} />
    </div>
  );
}

export const FileChangeCard = memo(function FileChangeCard(props: FileChangeCardProps) {
  const { diffPreviews } = props;
  const [expanded, setExpanded] = useState(false);
  const [previewOverflows, setPreviewOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const hasMoreContent =
    expanded ||
    diffPreviews.some((h) => h.truncated) ||
    previewOverflows ||
    diffPreviews.length > 1;

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el || expanded) return;
    setPreviewOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [expanded, diffPreviews]);

  if (diffPreviews.length === 0) return null;

  const totalAdditions = diffPreviews.reduce((sum, h) => sum + h.stats.additions, 0);
  const totalDeletions = diffPreviews.reduce((sum, h) => sum + h.stats.deletions, 0);
  const isSingleHunk = diffPreviews.length === 1;

  const ExpandIcon = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <div
      data-scroll-anchor-target
      className="overflow-hidden rounded-xl border border-border/40 border-l-2 border-l-primary/25 bg-card/25"
    >
      {isSingleHunk ? (
        <HunkHeader hunk={diffPreviews[0]!} />
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <SquarePenIcon className="size-3.5 shrink-0 text-primary/50" />
          <span className="text-[11px] text-foreground/80">
            {diffPreviews.length} files changed
          </span>
          <DiffStatSummary additions={totalAdditions} deletions={totalDeletions} />
        </div>
      )}

      {!expanded && (
        <>
          {!isSingleHunk && (
            <div className="border-t border-border/20 px-3 py-1">
              {diffPreviews.map((hunk, idx) => (
                <div key={`${hunk.filePath}:${idx}`} className="flex items-center gap-1.5 py-0.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/60">
                    {shortenPath(hunk.filePath)}
                  </span>
                  <DiffStatSummary
                    additions={hunk.stats.additions}
                    deletions={hunk.stats.deletions}
                  />
                </div>
              ))}
            </div>
          )}
          {isSingleHunk && (
            <div ref={previewRef} style={{ maxHeight: PREVIEW_MAX_HEIGHT, overflow: "hidden" }}>
              <DiffLinesBlock
                filePath={diffPreviews[0]!.filePath}
                lines={diffPreviews[0]!.lines}
                truncated={false}
                maxHeight="none"
                showBottomFade={previewOverflows}
              />
            </div>
          )}
        </>
      )}

      {expanded &&
        diffPreviews.map((hunk, idx) => (
          <div key={`${hunk.filePath}:${idx}`}>
            {!isSingleHunk && (
              <div className="border-t border-border/20 px-3 py-1">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {hunk.filePath}
                </span>
              </div>
            )}
            <DiffLinesBlock
              filePath={hunk.filePath}
              lines={hunk.fullLines}
              truncated={false}
              maxHeight="none"
              showBottomFade={false}
            />
          </div>
        ))}

      {hasMoreContent && (
        <button
          type="button"
          data-scroll-anchor-ignore
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/30 py-1.5 text-[10px] text-muted-foreground/50 transition-colors hover:bg-muted/20 hover:text-muted-foreground/70"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <ExpandIcon className="size-3" />
          <span>{expanded ? "Hide diff" : "Show full diff"}</span>
        </button>
      )}
    </div>
  );
});
