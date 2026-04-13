import { describe, expect, it } from "vitest";
import type { MessageId, TurnId } from "@marcode/contracts";
import {
  truncateQuotedText,
  quotedContextDedupKey,
  formatQuotedContextPreview,
  formatQuotedContextTooltip,
  buildQuotedContextBlock,
  appendQuotedContextsToPrompt,
  extractLeadingQuotedContexts,
  type QuotedContext,
} from "./quotedContext";

function makeContext(overrides: Partial<QuotedContext> = {}): QuotedContext {
  return {
    id: "ctx-1",
    messageId: "msg-1" as MessageId,
    turnId: "turn-1" as TurnId,
    text: "hello world",
    ...overrides,
  };
}

describe("truncateQuotedText", () => {
  it("returns text unchanged when under the limit", () => {
    const result = truncateQuotedText("short text");
    expect(result.text).toBe("short text");
    expect(result.wasTruncated).toBe(false);
  });

  it("truncates long text and appends suffix", () => {
    const longText = "x".repeat(6000);
    const result = truncateQuotedText(longText);
    expect(result.wasTruncated).toBe(true);
    expect(result.text).toHaveLength(5000);
    expect(result.text).toMatch(/\n\.\.\.\[truncated\]$/);
  });
});

describe("quotedContextDedupKey", () => {
  it("uses filePath when present", () => {
    const ctx = makeContext({ filePath: "/src/index.ts", startOffset: 10, endOffset: 50 });
    expect(quotedContextDedupKey(ctx)).toBe("/src/index.ts\u000010\u000050");
  });

  it("falls back to messageId when filePath is absent", () => {
    const ctx = makeContext({ filePath: undefined, startOffset: 5, endOffset: 20 });
    expect(quotedContextDedupKey(ctx)).toBe("msg-1\u00005\u000020");
  });
});

describe("formatQuotedContextPreview", () => {
  it("extracts filename from filePath", () => {
    const ctx = makeContext({ filePath: "/Users/dev/project/src/utils.ts" });
    expect(formatQuotedContextPreview(ctx)).toBe("utils.ts");
  });

  it("truncates long text at 80 characters with ellipsis", () => {
    const longText = "a".repeat(100);
    const ctx = makeContext({ text: longText });
    const preview = formatQuotedContextPreview(ctx);
    expect(preview).toHaveLength(80);
    expect(preview).toBe("a".repeat(79) + "…");
  });
});

describe("formatQuotedContextTooltip", () => {
  it("truncates text longer than 300 characters", () => {
    const longText = "b".repeat(400);
    const ctx = makeContext({ text: longText });
    const tooltip = formatQuotedContextTooltip(ctx);
    expect(tooltip).toHaveLength(301);
    expect(tooltip).toBe("b".repeat(300) + "…");
  });
});

describe("buildQuotedContextBlock", () => {
  it("returns empty string for no contexts", () => {
    expect(buildQuotedContextBlock([])).toBe("");
  });

  it("wraps context in XML tags with file_path attribute", () => {
    const ctx = makeContext({ filePath: "/src/foo.ts", text: "const x = 1;" });
    const result = buildQuotedContextBlock([ctx]);
    expect(result).toContain('<quoted_context file_path="/src/foo.ts">');
    expect(result).toContain("const x = 1;");
    expect(result).toContain("</quoted_context>");
  });

  it("escapes closing quoted_context tags in body", () => {
    const ctx = makeContext({ text: "before </quoted_context> after" });
    const result = buildQuotedContextBlock([ctx]);
    expect(result).not.toContain("</quoted_context> after");
    expect(result).toContain("[/quoted_context]");
  });

  it("includes language attribute when codeLanguage is set", () => {
    const ctx = makeContext({
      filePath: "/src/app.tsx",
      codeLanguage: "typescript",
      text: "const y = 2;",
    });
    const result = buildQuotedContextBlock([ctx]);
    expect(result).toContain('language="typescript"');
  });
});

describe("appendQuotedContextsToPrompt", () => {
  it("prepends context block before prompt text", () => {
    const ctx = makeContext({ filePath: "/src/a.ts", text: "code here" });
    const result = appendQuotedContextsToPrompt("fix this bug", [ctx]);
    expect(result).toMatch(/^<quoted_context/);
    expect(result).toContain("fix this bug");
    expect(result.indexOf("</quoted_context>")).toBeLessThan(result.indexOf("fix this bug"));
  });

  it("returns prompt unchanged when no contexts provided", () => {
    expect(appendQuotedContextsToPrompt("hello", [])).toBe("hello");
  });
});

describe("extractLeadingQuotedContexts", () => {
  it("parses a single quoted context block", () => {
    const input =
      '<quoted_context file_path="/src/file.ts" language="typescript">\nconst x = 1;\n</quoted_context>\n\nfix the bug';
    const result = extractLeadingQuotedContexts(input);
    expect(result.contextCount).toBe(1);
    expect(result.promptText).toBe("fix the bug");
    expect(result.contexts[0]!.header).toBe("Quoted diff (file.ts)");
    expect(result.contexts[0]!.body).toBe("const x = 1;");
  });

  it("parses multiple quoted context blocks", () => {
    const input = [
      '<quoted_context file_path="/src/a.ts">',
      "line a",
      "</quoted_context>",
      "",
      '<quoted_context language="python">',
      "line b",
      "</quoted_context>",
      "",
      "user prompt",
    ].join("\n");
    const result = extractLeadingQuotedContexts(input);
    expect(result.contextCount).toBe(2);
    expect(result.promptText).toBe("user prompt");
    expect(result.contexts[0]!.header).toBe("Quoted diff (a.ts)");
    expect(result.contexts[1]!.header).toBe("Quoted code (python)");
  });

  it("returns full text when no blocks are present", () => {
    const input = "just a regular prompt";
    const result = extractLeadingQuotedContexts(input);
    expect(result.contextCount).toBe(0);
    expect(result.promptText).toBe("just a regular prompt");
    expect(result.contexts).toEqual([]);
  });
});
