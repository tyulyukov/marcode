import type { MessageId, TurnId } from "@marcode/contracts";

export interface QuotedContext {
  readonly id: string;
  readonly messageId: MessageId;
  readonly turnId: TurnId | null;
  readonly text: string;
  readonly codeLanguage?: string | undefined;
  readonly startOffset?: number | undefined;
  readonly endOffset?: number | undefined;
  readonly filePath?: string | undefined;
}

const MAX_QUOTED_TEXT_LENGTH = 5000;
const TRUNCATION_SUFFIX = "\n...[truncated]";

const LEADING_QUOTED_CONTEXT_BLOCK_PATTERN =
  /^(<quoted_context[^>]*>\n[\s\S]*?\n<\/quoted_context>\n*)+/;

const SINGLE_QUOTED_CONTEXT_BLOCK_PATTERN =
  /<quoted_context([^>]*)>\n([\s\S]*?)\n<\/quoted_context>/g;

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
  const source = context.filePath ?? context.messageId;
  return `${source}\u0000${context.startOffset ?? ""}\u0000${context.endOffset ?? ""}`;
}

export function formatQuotedContextPreview(context: QuotedContext): string {
  if (context.filePath) {
    const fileName = context.filePath.split("/").pop() ?? context.filePath;
    return fileName;
  }
  const maxPreview = 80;
  const singleLine = context.text.replace(/\n/g, " ").trim();
  return singleLine.length > maxPreview ? `${singleLine.slice(0, maxPreview - 1)}…` : singleLine;
}

const MAX_TOOLTIP_LENGTH = 300;

export function formatQuotedContextTooltip(context: QuotedContext): string {
  return context.text.length > MAX_TOOLTIP_LENGTH
    ? `${context.text.slice(0, MAX_TOOLTIP_LENGTH)}…`
    : context.text;
}

function sanitizeCodeLanguage(language: string): string {
  return language.replace(/[^a-zA-Z0-9+.\-_#]/g, "");
}

function escapeQuotedContextBody(text: string): string {
  return text.replace(/<\/quoted_context>/gi, "[/quoted_context]");
}

function formatSingleQuotedContextBlock(context: QuotedContext): string {
  const safeLang = context.codeLanguage ? sanitizeCodeLanguage(context.codeLanguage) : undefined;
  const langAttr = safeLang ? ` language="${safeLang}"` : "";
  const safeText = escapeQuotedContextBody(context.text);
  const sourceAttr = context.filePath
    ? ` file_path="${context.filePath}"`
    : ` message_id="${context.messageId}"`;
  return `<quoted_context${sourceAttr}${langAttr}>\n${safeText}\n</quoted_context>`;
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
    const filePathMatch = attrs.match(/file_path="([^"]+)"/);
    const filePath = filePathMatch?.[1];
    const header = filePath
      ? `Quoted diff (${filePath.split("/").pop() ?? filePath})`
      : language
        ? `Quoted code (${language})`
        : "Quoted text";
    contexts.push({ header, body: body.trim() });
    blockMatch = blockPattern.exec(leadingBlock);
  }

  return { promptText, contextCount: contexts.length, contexts };
}
