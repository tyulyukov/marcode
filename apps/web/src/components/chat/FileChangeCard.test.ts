import { parsePatchFiles } from "@pierre/diffs";
import { describe, expect, it } from "vitest";
import { extractDiffPreviews } from "~/lib/inlineDiff";
import { normalizeFileChangePreviewDiff } from "./FileChangeCard";

describe("normalizeFileChangePreviewDiff", () => {
  it("suppresses the leading unmodified-lines separator without removing middle separators", () => {
    const oldString = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`).join("\n");
    const newString = Array.from({ length: 30 }, (_, index) =>
      index === 4 || index === 24 ? `LINE-${index + 1}` : `line-${index + 1}`,
    ).join("\n");

    const [hunk] = extractDiffPreviews({
      data: {
        toolName: "Edit",
        input: {
          file_path: "f.ts",
          old_string: oldString,
          new_string: newString,
        },
      },
    });

    const fileDiff = parsePatchFiles(hunk!.previewPatch!, "file-change-card-test")[0]!.files[0]!;
    expect(fileDiff.hunks[0]!.collapsedBefore).toBe(4);
    expect(fileDiff.hunks[1]!.collapsedBefore).toBe(13);

    const normalized = normalizeFileChangePreviewDiff(fileDiff);
    expect(normalized.hunks[0]!.collapsedBefore).toBe(0);
    expect(normalized.hunks[1]!.collapsedBefore).toBe(13);
  });
});
