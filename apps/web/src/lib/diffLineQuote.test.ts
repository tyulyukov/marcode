import { parsePatchFiles } from "@pierre/diffs";
import { describe, expect, it } from "vitest";
import {
  buildQuoteFromInlineDiffLines,
  buildQuoteFromPierreFileDiff,
  formatDiffMarkedLines,
  inferLanguageFromFilePath,
} from "./diffLineQuote";
import type { DiffLine } from "./inlineDiff";

const INLINE_LINES: DiffLine[] = [
  { type: "context", content: "same" },
  { type: "deletion", content: "old" },
  { type: "separator", content: "7" },
  { type: "addition", content: "new" },
];

function parseSingleFileDiff() {
  const patch = [
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,3 +1,4 @@",
    " same",
    "-old",
    "+new",
    "+extra",
    " tail",
  ].join("\n");
  const parsed = parsePatchFiles(patch, "diff-line-quote-test");
  const fileDiff = parsed.flatMap((entry) => entry.files)[0];
  if (!fileDiff) throw new Error("Expected test patch to parse one file");
  return fileDiff;
}

describe("diffLineQuote", () => {
  it("infers languages from file paths", () => {
    expect(inferLanguageFromFilePath("src/App.tsx")).toBe("tsx");
    expect(inferLanguageFromFilePath("Dockerfile")).toBe("dockerfile");
    expect(inferLanguageFromFilePath("README.unknown")).toBeUndefined();
  });

  it("formats addition, deletion, and context lines with diff markers", () => {
    expect(
      formatDiffMarkedLines([
        { type: "context", content: "same" },
        { type: "deletion", content: "old" },
        { type: "addition", content: "new" },
      ]),
    ).toBe(" same\n-old\n+new");
  });

  it("ignores separator lines in inline previews", () => {
    expect(
      buildQuoteFromInlineDiffLines({
        lines: INLINE_LINES,
        selection: { startIndex: 0, endIndex: 3 },
      }),
    ).toMatchObject({
      text: " same\n-old\n+new",
      lineStart: 1,
      lineEnd: 4,
    });
  });

  it("handles reversed inline selection ranges", () => {
    expect(
      buildQuoteFromInlineDiffLines({
        lines: INLINE_LINES,
        selection: { startIndex: 3, endIndex: 1 },
      })?.text,
    ).toBe("-old\n+new");
  });

  it("returns null for empty inline selections", () => {
    expect(
      buildQuoteFromInlineDiffLines({
        lines: INLINE_LINES,
        selection: { startIndex: 2, endIndex: 2 },
      }),
    ).toBeNull();
  });

  it("extracts a unified pierre diff selection", () => {
    const fileDiff = parseSingleFileDiff();
    expect(
      buildQuoteFromPierreFileDiff({
        filePath: "src/app.ts",
        fileDiff,
        mode: "unified",
        selection: { start: 2, side: "deletions", end: 3, endSide: "additions" },
      }),
    ).toMatchObject({
      text: "-old\n+new\n+extra",
      lineStart: 2,
      lineEnd: 3,
    });
  });

  it("extracts split additions selection", () => {
    const fileDiff = parseSingleFileDiff();
    expect(
      buildQuoteFromPierreFileDiff({
        filePath: "src/app.ts",
        fileDiff,
        mode: "split",
        selection: { start: 2, end: 3, side: "additions" },
      }),
    ).toMatchObject({
      text: "+new\n+extra",
      lineStart: 2,
      lineEnd: 3,
      selectionSide: "additions",
    });
  });

  it("extracts split deletions selection", () => {
    const fileDiff = parseSingleFileDiff();
    expect(
      buildQuoteFromPierreFileDiff({
        filePath: "src/app.ts",
        fileDiff,
        mode: "split",
        selection: { start: 2, end: 2, side: "deletions" },
      }),
    ).toMatchObject({
      text: "-old",
      lineStart: 2,
      lineEnd: 2,
      selectionSide: "deletions",
    });
  });

  it("returns null for unsupported pierre selections", () => {
    const fileDiff = parseSingleFileDiff();
    expect(
      buildQuoteFromPierreFileDiff({
        filePath: "src/app.ts",
        fileDiff,
        mode: "unified",
        selection: { start: 99, end: 100 },
      }),
    ).toBeNull();
  });
});
