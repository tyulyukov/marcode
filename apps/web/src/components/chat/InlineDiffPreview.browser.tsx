import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { QuotedContext } from "../../lib/quotedContext";
import type { InlineDiffHunk } from "../../lib/inlineDiff";
import { InlineDiffPreview } from "./InlineDiffPreview";

const HUNK: InlineDiffHunk = {
  filePath: "src/app.ts",
  operation: "edit",
  lines: [
    { type: "context", content: "same" },
    { type: "deletion", content: "old" },
    { type: "addition", content: "new" },
  ],
  fullLines: [
    { type: "context", content: "same" },
    { type: "deletion", content: "old" },
    { type: "addition", content: "new" },
  ],
  truncated: false,
  stats: { additions: 1, deletions: 1 },
  patch: "",
};

async function mountPreview(onReplyToSelection = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(
    <InlineDiffPreview hunk={HUNK} turnId={null} onReplyToSelection={onReplyToSelection} />,
    { container: host },
  );
  return {
    host,
    onReplyToSelection,
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

describe("InlineDiffPreview line selection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("quotes a selected diff line", async () => {
    const mounted = await mountPreview();
    try {
      await page.getByRole("button", { name: "Select diff line 2" }).click();
      expect(mounted.host.querySelector("[data-inline-diff-line-selected='true']")).toBeTruthy();

      await page.getByRole("button", { name: "Reply" }).click();
      expect(mounted.onReplyToSelection).toHaveBeenCalledTimes(1);
      const context = mounted.onReplyToSelection.mock.calls[0]?.[0] as QuotedContext;
      expect(context).toMatchObject({
        source: "diff",
        filePath: "src/app.ts",
        text: "-old",
        lineStart: 2,
        lineEnd: 2,
      });
    } finally {
      await mounted.cleanup();
    }
  });
});
