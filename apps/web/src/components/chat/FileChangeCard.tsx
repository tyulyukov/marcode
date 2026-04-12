import { parsePatchFiles } from "@pierre/diffs";
import { cn } from "~/lib/utils";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { ChevronDownIcon, ChevronUpIcon, ShieldQuestionIcon, SquarePenIcon } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { type InlineDiffHunk } from "~/lib/inlineDiff";
import { buildPatchCacheKey, resolveDiffThemeName } from "~/lib/diffRendering";
import { useTheme } from "~/hooks/useTheme";
import { DiffStatSummary, OPERATION_LABELS, relativizePath } from "./InlineDiffPreview";

type DiffThemeType = "light" | "dark";

const PREVIEW_MAX_HEIGHT = "120px";
const MIN_OVERFLOW_PX = 24;

const INLINE_DIFF_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

pre[data-diff] {
  font-size: 11px !important;
  line-height: 18px !important;
}
`;

function parsePatch(patch: string, cacheScope: string): FileDiffMetadata | null {
  if (!patch || patch.trim().length === 0) return null;
  try {
    const parsed = parsePatchFiles(patch.trim(), buildPatchCacheKey(patch.trim(), cacheScope));
    const files = parsed.flatMap((p) => p.files);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

const InlineDiffBlock = memo(function InlineDiffBlock(props: {
  patch: string;
  cacheScope: string;
}) {
  const { patch, cacheScope } = props;
  const { resolvedTheme } = useTheme();

  const fileDiff = useMemo(() => parsePatch(patch, cacheScope), [patch, cacheScope]);

  if (!fileDiff) return null;

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={{
        diffStyle: "unified",
        lineDiffType: "none",
        overflow: "wrap",
        disableFileHeader: true,
        disableLineNumbers: true,
        theme: resolveDiffThemeName(resolvedTheme),
        themeType: resolvedTheme as DiffThemeType,
        unsafeCSS: INLINE_DIFF_CSS,
      }}
    />
  );
});

interface FileChangeCardProps {
  diffPreviews: ReadonlyArray<InlineDiffHunk>;
  cwd: string | undefined;
  isLive?: boolean;
  isPendingApproval?: boolean;
}

export const FileChangeCard = memo(function FileChangeCard(props: FileChangeCardProps) {
  const { diffPreviews, cwd, isPendingApproval = false } = props;
  const [expanded, setExpanded] = useState(false);
  const [previewOverflows, setPreviewOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || expanded) return;

    const check = () => setPreviewOverflows(el.scrollHeight > el.clientHeight + MIN_OVERFLOW_PX);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, diffPreviews]);

  if (diffPreviews.length === 0) return null;

  const totalAdditions = diffPreviews.reduce((sum, h) => sum + h.stats.additions, 0);
  const totalDeletions = diffPreviews.reduce((sum, h) => sum + h.stats.deletions, 0);
  const isSingleHunk = diffPreviews.length === 1;
  const hasMoreContent = expanded || previewOverflows || diffPreviews.length > 1;

  const ExpandIcon = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        isPendingApproval ? "border-l-blue-400/40" : "border-l-primary/25",
      )}
    >
      {isSingleHunk ? (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <SquarePenIcon className="size-3.5 shrink-0 text-primary/50" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {relativizePath(diffPreviews[0]!.filePath, cwd)}
          </span>
          <span className="shrink-0 rounded-sm bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
            {OPERATION_LABELS[diffPreviews[0]!.operation]}
          </span>
          <DiffStatSummary additions={diffPreviews[0]!.stats.additions} deletions={diffPreviews[0]!.stats.deletions} />
          {isPendingApproval && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400/70">
              <ShieldQuestionIcon className="size-3" />
              Approval requested
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <SquarePenIcon className="size-3.5 shrink-0 text-primary/50" />
          <span className="text-[11px] text-foreground/80">
            {diffPreviews.length} files changed
          </span>
          <DiffStatSummary additions={totalAdditions} deletions={totalDeletions} />
          {isPendingApproval && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400/70">
              <ShieldQuestionIcon className="size-3" />
              Approval requested
            </span>
          )}
        </div>
      )}

      {!expanded && (
        <>
          {!isSingleHunk && (
            <div className="border-t border-border/20 px-3 py-1">
              {diffPreviews.map((hunk) => (
                <div key={hunk.filePath} className="flex items-center gap-1.5 py-0.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/60">
                    {relativizePath(hunk.filePath, cwd)}
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
            <div
              ref={previewRef}
              className="relative"
              style={{ maxHeight: PREVIEW_MAX_HEIGHT, overflow: "hidden" }}
            >
              <InlineDiffBlock
                patch={diffPreviews[0]!.patch}
                cacheScope={`card-preview:${diffPreviews[0]!.filePath}`}
              />
              {previewOverflows && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/80 to-transparent" />
              )}
            </div>
          )}
        </>
      )}

      {expanded &&
        diffPreviews.map((hunk) => (
          <div key={hunk.filePath}>
            {!isSingleHunk && (
              <div className="border-t border-border/20 px-3 py-1">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {relativizePath(hunk.filePath, cwd)}
                </span>
              </div>
            )}
            <InlineDiffBlock patch={hunk.patch} cacheScope={`card-expanded:${hunk.filePath}`} />
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
