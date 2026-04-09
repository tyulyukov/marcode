import { CopyIcon, ReplyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageId, TurnId } from "@marcode/contracts";
import type { QuotedContext } from "../../lib/quotedContext";
import { truncateQuotedText } from "../../lib/quotedContext";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

interface SelectionReplyToolbarProps {
  messageId: MessageId;
  turnId: TurnId | null;
  containerRef: React.RefObject<HTMLElement | null>;
  onReply: (context: QuotedContext) => void;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

let nextQuotedContextId = 0;
function newQuotedContextId(): string {
  nextQuotedContextId += 1;
  return `quoted-${Date.now()}-${nextQuotedContextId}`;
}

function getSelectionTextAndMeta(
  containerEl: HTMLElement,
): {
  text: string;
  startOffset: number;
  endOffset: number;
  codeLanguage: string | undefined;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range || !containerEl.contains(range.startContainer)) return null;

  const text = selection.toString().trim();
  if (text.length === 0) return null;

  const codeBlock = findAncestorCodeBlock(range.startContainer, containerEl);
  const codeLanguage = codeBlock ? extractCodeLanguageFromBlock(codeBlock) : undefined;

  const preRange = document.createRange();
  preRange.selectNodeContents(containerEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + text.length;

  return { text, startOffset, endOffset, codeLanguage };
}

function findAncestorCodeBlock(node: Node, boundary: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== boundary) {
    if (current instanceof HTMLElement && current.classList.contains("chat-markdown-codeblock")) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function extractCodeLanguageFromBlock(codeBlock: HTMLElement): string | undefined {
  const codeEl = codeBlock.querySelector("code[class*='language-']");
  if (!codeEl) return undefined;
  const match = codeEl.className.match(/language-(\S+)/);
  return match?.[1];
}

export const SelectionReplyToolbar = memo(function SelectionReplyToolbar(
  props: SelectionReplyToolbarProps,
) {
  const { messageId, turnId, containerRef, onReply } = props;
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  useEffect(() => {
    const handleSelectionChange = () => {
      const container = containerRef.current;
      if (!container) {
        setPosition(null);
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!range || !container.contains(range.startContainer)) {
        setPosition(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        setPosition(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const toolbarHeight = 32;
      const gap = 6;

      setPosition({
        top: rect.top - toolbarHeight - gap + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef]);

  const handleReply = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const meta = getSelectionTextAndMeta(container);
    if (!meta) return;

    const { text: rawText, wasTruncated } = truncateQuotedText(meta.text);
    if (wasTruncated) {
      console.warn("Quoted text was truncated to 5000 characters");
    }

    const context: QuotedContext = {
      id: newQuotedContextId(),
      messageId,
      turnId,
      text: rawText,
      codeLanguage: meta.codeLanguage,
      startOffset: meta.startOffset,
      endOffset: meta.endOffset,
    };

    onReply(context);
    window.getSelection()?.removeAllRanges();
    setPosition(null);
  }, [containerRef, messageId, turnId, onReply]);

  const handleCopy = useCallback(() => {
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (text.length > 0) {
      copyToClipboard(text);
    }
  }, [copyToClipboard]);

  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.getSelection()?.removeAllRanges();
        setPosition(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "r") {
        e.preventDefault();
        handleReply();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [position, handleReply]);

  if (!position) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        position: "absolute",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        onClick={handleReply}
        title="Reply to selection (⌘⇧R)"
      >
        <ReplyIcon className="size-3" />
        Reply
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        onClick={handleCopy}
        title="Copy selection"
      >
        <CopyIcon className="size-3" />
      </button>
    </div>,
    document.body,
  );
});
