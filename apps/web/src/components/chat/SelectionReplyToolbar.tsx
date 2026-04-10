import { CheckIcon, CopyIcon, ReplyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageId, TurnId } from "@marcode/contracts";
import type { QuotedContext } from "../../lib/quotedContext";
import { truncateQuotedText } from "../../lib/quotedContext";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { randomUUID } from "../../lib/utils";

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

const TOOLBAR_HEIGHT_PX = 32;
const TOOLBAR_GAP_PX = 6;

type SelectionContainerCallback = (hasSelection: boolean) => void;
const containerRegistry = new Map<HTMLElement, SelectionContainerCallback>();
let globalListenerAttached = false;

function findRegisteredContainer(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && containerRegistry.has(current)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function handleGlobalSelectionChange() {
  const selection = window.getSelection();
  let matchedContainer: HTMLElement | null = null;

  if (selection && !selection.isCollapsed && selection.rangeCount > 0 && selection.anchorNode) {
    matchedContainer = findRegisteredContainer(selection.anchorNode);
  }

  for (const [container, callback] of containerRegistry) {
    callback(container === matchedContainer);
  }
}

function registerSelectionContainer(el: HTMLElement, callback: SelectionContainerCallback) {
  containerRegistry.set(el, callback);
  if (!globalListenerAttached) {
    globalListenerAttached = true;
    document.addEventListener("selectionchange", handleGlobalSelectionChange);
  }
}

function unregisterSelectionContainer(el: HTMLElement) {
  containerRegistry.delete(el);
  if (containerRegistry.size === 0 && globalListenerAttached) {
    globalListenerAttached = false;
    document.removeEventListener("selectionchange", handleGlobalSelectionChange);
  }
}

function clampRangeToContainer(range: Range, containerEl: HTMLElement): Range {
  if (containerEl.contains(range.endContainer)) return range;

  const clamped = range.cloneRange();
  clamped.setEndAfter(containerEl.lastChild ?? containerEl);
  return clamped;
}

function getSelectionMeta(containerEl: HTMLElement): {
  text: string;
  startOffset: number;
  endOffset: number;
  codeLanguage: string | undefined;
  rect: DOMRect;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range || !containerEl.contains(range.startContainer)) return null;

  const effective = clampRangeToContainer(range, containerEl);

  const text = effective.toString().trim();
  if (text.length === 0) return null;

  const codeBlock = findAncestorCodeBlock(effective.startContainer, containerEl);
  const codeLanguage = codeBlock ? extractCodeLanguageFromBlock(codeBlock) : undefined;

  const preRange = document.createRange();
  preRange.selectNodeContents(containerEl);
  preRange.setEnd(effective.startContainer, effective.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + text.length;

  const rect = effective.getBoundingClientRect();

  return { text, startOffset, endOffset, codeLanguage, rect };
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
  const positionRef = useRef<ToolbarPosition | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const callback: SelectionContainerCallback = (hasSelection) => {
      if (!hasSelection) {
        if (positionRef.current !== null) {
          positionRef.current = null;
          setPosition(null);
        }
        return;
      }

      const meta = getSelectionMeta(container);
      if (!meta) {
        if (positionRef.current !== null) {
          positionRef.current = null;
          setPosition(null);
        }
        return;
      }

      const next = {
        top: meta.rect.top - TOOLBAR_HEIGHT_PX - TOOLBAR_GAP_PX,
        left: meta.rect.left + meta.rect.width / 2,
      };
      positionRef.current = next;
      setPosition(next);
    };

    registerSelectionContainer(container, callback);
    return () => unregisterSelectionContainer(container);
  }, [containerRef]);

  const handleReply = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const meta = getSelectionMeta(container);
    if (!meta) return;

    const { text: rawText, wasTruncated } = truncateQuotedText(meta.text);
    if (wasTruncated) {
      console.warn("Quoted text was truncated to 5000 characters");
    }

    const context: QuotedContext = {
      id: randomUUID(),
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
      className="pointer-events-auto z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 shadow-lg"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
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
        {isCopied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </button>
    </div>,
    document.body,
  );
});
