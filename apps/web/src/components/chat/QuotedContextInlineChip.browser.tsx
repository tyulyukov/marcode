import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { QuotedContextInlineChip } from "./QuotedContextInlineChip";

async function mountChip(props: {
  preview: string;
  tooltipText: string;
  isDiff?: boolean;
  onRemove?: () => void;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(
    <QuotedContextInlineChip
      preview={props.preview}
      tooltipText={props.tooltipText}
      {...(props.isDiff !== undefined ? { isDiff: props.isDiff } : {})}
      {...(props.onRemove !== undefined ? { onRemove: props.onRemove } : {})}
    />,
    { container: host },
  );
  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

describe("QuotedContextInlineChip", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders preview text", async () => {
    const mounted = await mountChip({
      preview: "selected code snippet",
      tooltipText: "Full context here",
    });

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("selected code snippet");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows remove button and calls onRemove when clicked", async () => {
    const onRemove = vi.fn();
    const mounted = await mountChip({
      preview: "removable chip",
      tooltipText: "Tooltip",
      onRemove,
    });

    try {
      await page.getByRole("button", { name: "Remove quoted context" }).click();

      expect(onRemove).toHaveBeenCalledOnce();
    } finally {
      await mounted.cleanup();
    }
  });

  it("applies diff styling when isDiff is true", async () => {
    const mountedDiff = await mountChip({
      preview: "diff content",
      tooltipText: "Diff tooltip",
      isDiff: true,
    });

    try {
      await vi.waitFor(() => {
        const chipSpan = document.querySelector("span[class*='emerald']");
        expect(chipSpan).not.toBeNull();
      });
    } finally {
      await mountedDiff.cleanup();
    }

    const mountedNonDiff = await mountChip({
      preview: "quote content",
      tooltipText: "Quote tooltip",
      isDiff: false,
    });

    try {
      await vi.waitFor(() => {
        const chipSpan = document.querySelector("span[class*='violet']");
        expect(chipSpan).not.toBeNull();
        const emeraldSpan = document.querySelector("span[class*='emerald']");
        expect(emeraldSpan).toBeNull();
      });
    } finally {
      await mountedNonDiff.cleanup();
    }
  });
});
