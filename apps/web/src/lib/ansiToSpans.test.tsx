import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ansiToSpans } from "./ansiToSpans";

describe("ansiToSpans", () => {
  it("returns plain string when no ANSI codes are present", () => {
    const result = ansiToSpans("hello world");
    expect(typeof result).toBe("string");
    expect(result).toBe("hello world");
  });

  it("produces a span with fontWeight bold for SGR code 1", () => {
    const result = ansiToSpans("\x1b[1mbold text\x1b[0m");
    const html = renderToStaticMarkup(<>{result}</>);
    expect(html).toContain('font-weight:bold');
    expect(html).toContain("bold text");
  });

  it("maps foreground color code 31 to #e06c75", () => {
    const result = ansiToSpans("\x1b[31mred text\x1b[0m");
    const html = renderToStaticMarkup(<>{result}</>);
    expect(html).toContain("color:#e06c75");
    expect(html).toContain("red text");
  });

  it("clears styles after a reset code", () => {
    const result = ansiToSpans("\x1b[1mbold\x1b[0mplain");
    const html = renderToStaticMarkup(<>{result}</>);
    expect(html).toContain('font-weight:bold');
    expect(html).toContain("bold");
    expect(html).toContain("plain");
    expect(html).not.toMatch(/<span[^>]*>plain<\/span>/);
  });

  it("combines multiple styles (bold + italic)", () => {
    const result = ansiToSpans("\x1b[1;3mstyled\x1b[0m");
    const html = renderToStaticMarkup(<>{result}</>);
    expect(html).toContain("font-weight:bold");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("styled");
  });

  it("handles unknown SGR codes gracefully without crashing", () => {
    const result = ansiToSpans("\x1b[999mstill works\x1b[0m");
    const html = renderToStaticMarkup(<>{result}</>);
    expect(html).toContain("still works");
  });
});
