import type { MessageId, TurnId } from "@marcode/contracts";

export interface QuotedContext {
  readonly id: string;
  readonly messageId: MessageId;
  readonly turnId: TurnId | null;
  readonly text: string;
  readonly codeLanguage?: string | undefined;
  readonly startOffset?: number | undefined;
  readonly endOffset?: number | undefined;
}

const MAX_QUOTED_TEXT_LENGTH = 5000;
const TRUNCATION_SUFFIX = "\n...[truncated]";

const LEADING_QUOTED_CONTEXT_BLOCK_PATTERN =
  /^(<quoted_context[^>]*>\n[\s\S]*?\n<\/quoted_context>\n*)+/;

const SINGLE_QUOTED_CONTEXT_BLOCK_PATTERN =
  /<quoted_context([^>]*)>\n([\s\S]*?)\n<\/quoted_context>/g;

const ALL_QUOTED_CONTEXT_BLOCKS_PATTERN = /<quoted_context[^>]*>\n[\s\S]*?\n<\/quoted_context>\n*/g;

export interface ParsedQuotedContextEntry {
  readonly header: string;
  readonly body: string;
}

export interface ExtractedQuotedContexts {
  readonly promptText: string;
  readonly contextCount: number;
  readonly contexts: ParsedQuotedContextEntry[];
}

export function truncateQuotedText(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= MAX_QUOTED_TEXT_LENGTH) {
    return { text, wasTruncated: false };
  }
  return {
    text: text.slice(0, MAX_QUOTED_TEXT_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX,
    wasTruncated: true,
  };
}

export function quotedContextDedupKey(context: QuotedContext): string {
  return `${context.messageId}\u0000${context.startOffset ?? ""}\u0000${context.endOffset ?? ""}`;
}

export function formatQuotedContextPreview(context: QuotedContext): string {
  const maxPreview = 80;
  const singleLine = context.text.replace(/\n/g, " ").trim();
  return singleLine.length > maxPreview ? `${singleLine.slice(0, maxPreview - 1)}…` : singleLine;
}

function formatSingleQuotedContextBlock(context: QuotedContext): string {
  const langAttr = context.codeLanguage ? ` language="${context.codeLanguage}"` : "";
  return `<quoted_context message_id="${context.messageId}"${langAttr}>\n${context.text}\n</quoted_context>`;
}

export function buildQuotedContextBlock(contexts: ReadonlyArray<QuotedContext>): string {
  if (contexts.length === 0) return "";
  return contexts.map(formatSingleQuotedContextBlock).join("\n\n");
}

export function appendQuotedContextsToPrompt(
  promptText: string,
  contexts: ReadonlyArray<QuotedContext>,
): string {
  if (contexts.length === 0) return promptText;
  const block = buildQuotedContextBlock(contexts);
  return promptText.trim().length > 0 ? `${block}\n\n${promptText}` : block;
}

export function extractLeadingQuotedContexts(text: string): ExtractedQuotedContexts {
  const leadingMatch = LEADING_QUOTED_CONTEXT_BLOCK_PATTERN.exec(text);
  if (!leadingMatch) {
    return { promptText: text, contextCount: 0, contexts: [] };
  }

  const leadingBlock = leadingMatch[0];
  const promptText = text.slice(leadingBlock.length).trimStart();
  const contexts: ParsedQuotedContextEntry[] = [];

  const blockPattern = new RegExp(SINGLE_QUOTED_CONTEXT_BLOCK_PATTERN.source, "g");
  let blockMatch = blockPattern.exec(leadingBlock);
  while (blockMatch) {
    const attrs = blockMatch[1] ?? "";
    const body = blockMatch[2] ?? "";
    const langMatch = attrs.match(/language="([^"]+)"/);
    const language = langMatch?.[1];
    const header = language ? `Quoted code (${language})` : "Quoted text";
    contexts.push({ header, body: body.trim() });
    blockMatch = blockPattern.exec(leadingBlock);
  }

  return { promptText, contextCount: contexts.length, contexts };
}

export function stripAllQuotedContextBlocks(text: string): string {
  return text.replace(ALL_QUOTED_CONTEXT_BLOCKS_PATTERN, "").trim();
}
