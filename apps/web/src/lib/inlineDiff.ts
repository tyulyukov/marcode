export interface DiffLine {
  type: "context" | "addition" | "deletion" | "separator";
  content: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface InlineDiffHunk {
  filePath: string;
  operation: "edit" | "write";
  lines: ReadonlyArray<DiffLine>;
  fullLines: ReadonlyArray<DiffLine>;
  truncated: boolean;
  stats: DiffStats;
}

const MAX_DIFF_LINES = 40;
const MAX_LCS_INPUT_LINES = 200;
const CONTEXT_RADIUS = 3;

const EDIT_TOOL_NAMES = new Set([
  "edit",
  "Edit",
  "MultiEdit",
  "multiedit",
  "file_edit",
  "EditTool",
  "str_replace_editor",
]);

const WRITE_TOOL_NAMES = new Set([
  "write",
  "Write",
  "file_write",
  "WriteTool",
  "create_file",
  "CreateFile",
]);

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) return [];

  if (n === 0) {
    return newLines.map((line) => ({ type: "addition" as const, content: line }));
  }
  if (m === 0) {
    return oldLines.map((line) => ({ type: "deletion" as const, content: line }));
  }

  if (n > MAX_LCS_INPUT_LINES || m > MAX_LCS_INPUT_LINES) {
    return [
      ...oldLines.map((line) => ({ type: "deletion" as const, content: line })),
      ...newLines.map((line) => ({ type: "addition" as const, content: line })),
    ];
  }

  const lcs = computeLCS(oldLines, newLines);

  const result: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  for (const match of lcs) {
    while (oldIdx < match.oldIndex) {
      result.push({ type: "deletion", content: oldLines[oldIdx]! });
      oldIdx++;
    }
    while (newIdx < match.newIndex) {
      result.push({ type: "addition", content: newLines[newIdx]! });
      newIdx++;
    }
    result.push({ type: "context", content: oldLines[oldIdx]! });
    oldIdx++;
    newIdx++;
  }

  while (oldIdx < n) {
    result.push({ type: "deletion", content: oldLines[oldIdx]! });
    oldIdx++;
  }
  while (newIdx < m) {
    result.push({ type: "addition", content: newLines[newIdx]! });
    newIdx++;
  }

  return result;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0) as number[]);

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const matches: LCSMatch[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.push({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  matches.reverse();
  return matches;
}

function trimContext(lines: DiffLine[]): DiffLine[] {
  const changeIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.type !== "context") {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return lines;

  const keep = new Set<number>();
  for (const idx of changeIndices) {
    keep.add(idx);
    for (let offset = 1; offset <= CONTEXT_RADIUS; offset++) {
      if (idx - offset >= 0) keep.add(idx - offset);
      if (idx + offset < lines.length) keep.add(idx + offset);
    }
  }

  const result: DiffLine[] = [];
  let lastKept = -1;
  for (let i = 0; i < lines.length; i++) {
    if (keep.has(i)) {
      if (lastKept !== -1 && i - lastKept > 1) {
        result.push({ type: "separator", content: String(i - lastKept - 1) });
      }
      result.push(lines[i]!);
      lastKept = i;
    }
  }

  return result;
}

function truncateDiffLines(lines: DiffLine[]): {
  lines: ReadonlyArray<DiffLine>;
  fullLines: ReadonlyArray<DiffLine>;
  truncated: boolean;
} {
  if (lines.length <= MAX_DIFF_LINES) {
    return { lines, fullLines: lines, truncated: false };
  }
  return { lines: lines.slice(0, MAX_DIFF_LINES), fullLines: lines, truncated: true };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractEditHunk(input: Record<string, unknown>): InlineDiffHunk | null {
  const filePath = asString(input.file_path) ?? asString(input.filePath) ?? asString(input.path);
  const oldString = asString(input.old_string) ?? asString(input.old_text);
  const newString = asString(input.new_string) ?? asString(input.new_text);

  if (!filePath || oldString == null || newString == null) return null;

  const rawLines = computeLineDiff(oldString, newString);
  const stats = diffStats(rawLines);
  const trimmed = trimContext(rawLines);
  const { lines, fullLines, truncated } = truncateDiffLines(trimmed);

  return { filePath, operation: "edit", lines, fullLines, truncated, stats };
}

function extractWriteHunk(input: Record<string, unknown>): InlineDiffHunk | null {
  const filePath = asString(input.file_path) ?? asString(input.filePath) ?? asString(input.path);
  const content = asString(input.content);

  if (!filePath || content == null) return null;

  const contentLines = splitLines(content);
  const rawLines: DiffLine[] = contentLines.map((line) => ({
    type: "addition" as const,
    content: line,
  }));
  const stats: DiffStats = { additions: rawLines.length, deletions: 0 };
  const { lines, fullLines, truncated } = truncateDiffLines(rawLines);

  return { filePath, operation: "write", lines, fullLines, truncated, stats };
}

export function extractDiffPreviews(payload: Record<string, unknown> | null): InlineDiffHunk[] {
  if (!payload) return [];

  const data = asRecord(payload.data);
  if (!data) return [];

  const toolName = asString(data.toolName);
  const input = asRecord(data.input);

  if (!toolName || !input) return [];

  if (EDIT_TOOL_NAMES.has(toolName)) {
    const hunk = extractEditHunk(input);
    return hunk ? [hunk] : [];
  }

  if (WRITE_TOOL_NAMES.has(toolName)) {
    const hunk = extractWriteHunk(input);
    return hunk ? [hunk] : [];
  }

  return [];
}

export function mergeDiffPreviews(
  a: ReadonlyArray<InlineDiffHunk>,
  b: ReadonlyArray<InlineDiffHunk>,
): InlineDiffHunk[] {
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];

  const byPath = new Map<string, InlineDiffHunk>();
  for (const hunk of a) {
    byPath.set(hunk.filePath, hunk);
  }
  for (const hunk of b) {
    byPath.set(hunk.filePath, hunk);
  }

  return [...byPath.values()];
}

export function diffStats(lines: ReadonlyArray<DiffLine>): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.type === "addition") additions++;
    if (line.type === "deletion") deletions++;
  }
  return { additions, deletions };
}
