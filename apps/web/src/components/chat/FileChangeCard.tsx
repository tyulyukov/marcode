import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { memo, useMemo } from "react";
import { type InlineDiffHunk } from "~/lib/inlineDiff";
import { buildPatchCacheKey, resolveDiffThemeName } from "~/lib/diffRendering";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { DiffStatSummary, OPERATION_LABELS, relativizePath } from "./InlineDiffPreview";
import { ToolCard } from "./_shared/ToolCard";

type DiffThemeType = "light" | "dark";

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

[data-file],
[data-virtualizer-buffer] {
  margin: 0 !important;
  padding: 0 !important;
}

pre[data-diff] {
  font-size: 11px !important;
  line-height: 18px !important;
  margin: 0 !important;
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
  isLatestTurn?: boolean;
}

export const FileChangeCard = memo(function FileChangeCard(props: FileChangeCardProps) {
  const { diffPreviews, cwd, isPendingApproval = false, isLatestTurn = false } = props;

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
    <InlineDiffBlock patch={firstHunk.patch} cacheScope={`card-preview:${firstHunk.filePath}`} />
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
          <InlineDiffBlock patch={hunk.patch} cacheScope={`card-expanded:${hunk.filePath}`} />
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
