import type { FileDiffMetadata } from "@pierre/diffs";
import type { DiffLine } from "./inlineDiff";

export type DiffQuoteSide = "additions" | "deletions";

export interface DiffQuoteSelection {
  start: number;
  end: number;
  side?: DiffQuoteSide;
  endSide?: DiffQuoteSide;
}

export interface DiffQuoteInput {
  filePath: string;
  selection: DiffQuoteSelection;
  mode: "unified" | "split";
}

export interface DiffQuoteResult {
  text: string;
  lineStart: number;
  lineEnd: number;
  selectionSide?: DiffQuoteSide;
}

type MarkedDiffLine = DiffLine & { type: "addition" | "deletion" | "context" };

interface PierreDiffQuoteInput extends DiffQuoteInput {
  fileDiff: FileDiffMetadata;
}

interface InlineDiffQuoteInput {
  lines: ReadonlyArray<DiffLine>;
  selection: {
    startIndex: number;
    endIndex: number;
  };
}

interface FlattenedPierreLine {
  marker: "+" | "-" | " ";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  side?: DiffQuoteSide;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  css: "css",
  scss: "scss",
  html: "html",
  vue: "vue",
  svelte: "svelte",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "mdx",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  lua: "lua",
  zig: "zig",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  dart: "dart",
  r: "r",
  scala: "scala",
  tf: "terraform",
  hcl: "hcl",
  dockerfile: "dockerfile",
  prisma: "prisma",
  xml: "xml",
  svg: "xml",
};

export function inferLanguageFromFilePath(filePath: string): string | undefined {
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? filePath.toLowerCase();
  if (fileName === "dockerfile" || fileName.endsWith(".dockerfile")) return "dockerfile";
  const ext = fileName.split(".").pop();
  return ext ? LANGUAGE_BY_EXTENSION[ext] : undefined;
}

export function formatDiffMarkedLines(lines: ReadonlyArray<MarkedDiffLine>): string {
  return lines
    .map((line) => {
      if (line.type === "addition") return `+${line.content}`;
      if (line.type === "deletion") return `-${line.content}`;
      return ` ${line.content}`;
    })
    .join("\n");
}

export function buildQuoteFromInlineDiffLines(input: InlineDiffQuoteInput): DiffQuoteResult | null {
  const start = Math.min(input.selection.startIndex, input.selection.endIndex);
  const end = Math.max(input.selection.startIndex, input.selection.endIndex);
  const selectedLines = input.lines
    .slice(start, end + 1)
    .filter((line): line is MarkedDiffLine => line.type !== "separator");
  if (selectedLines.length === 0) return null;

  return {
    text: formatDiffMarkedLines(selectedLines),
    lineStart: start + 1,
    lineEnd: end + 1,
  };
}

export function buildQuoteFromPierreFileDiff(input: PierreDiffQuoteInput): DiffQuoteResult | null {
  const flattened = flattenPierreFileDiff(input.fileDiff);
  if (flattened.length === 0) return null;

  const startSide = input.selection.side;
  const endSide = input.selection.endSide ?? startSide;
  const selectionSide =
    input.mode === "split" && startSide !== undefined ? startSide : (startSide ?? endSide);
  const startIndex = findPierreSelectionIndex(flattened, input.selection.start, startSide);
  const endIndex = findPierreSelectionIndex(
    flattened,
    input.selection.end,
    input.mode === "split" ? startSide : endSide,
  );
  if (startIndex === -1 || endIndex === -1) return null;

  const first = Math.min(startIndex, endIndex);
  const last = Math.max(startIndex, endIndex);
  const selected = flattened.slice(first, last + 1).filter((line) => {
    if (input.mode !== "split" || !startSide) return true;
    return line.side === startSide || line.marker === " ";
  });
  if (selected.length === 0) return null;

  const lineNumbers = selected
    .map((line) => lineNumberForSide(line, selectionSide))
    .filter((lineNumber): lineNumber is number => lineNumber !== undefined);
  if (lineNumbers.length === 0) return null;

  return {
    text: selected.map((line) => `${line.marker}${line.content}`).join("\n"),
    lineStart: Math.min(...lineNumbers),
    lineEnd: Math.max(...lineNumbers),
    ...(selectionSide ? { selectionSide } : {}),
  };
}

function lineNumberForSide(
  line: FlattenedPierreLine,
  side: DiffQuoteSide | undefined,
): number | undefined {
  if (side === "deletions") return line.oldLineNumber ?? line.newLineNumber;
  if (side === "additions") return line.newLineNumber ?? line.oldLineNumber;
  return line.newLineNumber ?? line.oldLineNumber;
}

function findPierreSelectionIndex(
  lines: ReadonlyArray<FlattenedPierreLine>,
  lineNumber: number,
  side: DiffQuoteSide | undefined,
): number {
  const primary = lines.findIndex((line) =>
    side === "deletions"
      ? line.oldLineNumber === lineNumber
      : side === "additions"
        ? line.newLineNumber === lineNumber
        : line.oldLineNumber === lineNumber || line.newLineNumber === lineNumber,
  );
  if (primary !== -1) return primary;
  return lines.findIndex(
    (line) => line.oldLineNumber === lineNumber || line.newLineNumber === lineNumber,
  );
}

function flattenPierreFileDiff(fileDiff: FileDiffMetadata): FlattenedPierreLine[] {
  const lines: FlattenedPierreLine[] = [];
  for (const hunk of fileDiff.hunks) {
    let deletionOffset = 0;
    let additionOffset = 0;

    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        for (let i = 0; i < content.lines; i++) {
          const deletionIndex = content.deletionLineIndex + i;
          const additionIndex = content.additionLineIndex + i;
          lines.push({
            marker: " ",
            content: cleanDiffLineContent(
              fileDiff.additionLines[additionIndex] ?? fileDiff.deletionLines[deletionIndex] ?? "",
            ),
            oldLineNumber: hunk.deletionStart + deletionOffset,
            newLineNumber: hunk.additionStart + additionOffset,
          });
          deletionOffset++;
          additionOffset++;
        }
        continue;
      }

      for (let i = 0; i < content.deletions; i++) {
        const deletionIndex = content.deletionLineIndex + i;
        lines.push({
          marker: "-",
          content: cleanDiffLineContent(fileDiff.deletionLines[deletionIndex] ?? ""),
          oldLineNumber: hunk.deletionStart + deletionOffset,
          side: "deletions",
        });
        deletionOffset++;
      }
      for (let i = 0; i < content.additions; i++) {
        const additionIndex = content.additionLineIndex + i;
        lines.push({
          marker: "+",
          content: cleanDiffLineContent(fileDiff.additionLines[additionIndex] ?? ""),
          newLineNumber: hunk.additionStart + additionOffset,
          side: "additions",
        });
        additionOffset++;
      }
    }
  }
  return lines;
}

function cleanDiffLineContent(content: string): string {
  return content.replace(/\r?\n$/u, "");
}
