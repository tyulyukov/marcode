import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { retainDetectedOverflow, ToolCard } from "./ToolCard";

describe("retainDetectedOverflow", () => {
  it("keeps overflow visible after a later transient non-overflow measurement", () => {
    expect(retainDetectedOverflow(true, false)).toBe(true);
  });

  it("turns on overflow after it is detected", () => {
    expect(retainDetectedOverflow(false, true)).toBe(true);
  });

  it("keeps overflow hidden before it is detected", () => {
    expect(retainDetectedOverflow(false, false)).toBe(false);
  });
});

describe("ToolCard", () => {
  it("uses visual transitions without height transitions", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolCard, {
        tool: "bash",
        primary: "Run command",
        body: createElement("pre", null, "ready"),
        defaultState: "preview",
      }),
    );

    expect(markup).toContain('data-slot="collapsible-panel"');
    expect(markup).toContain("transition-[opacity,translate]");
    expect(markup).toContain("data-starting-style:opacity-0");
    expect(markup).not.toContain("transition-[height]");
  });
});
