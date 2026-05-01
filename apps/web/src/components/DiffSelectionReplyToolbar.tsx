import { CheckIcon, CopyIcon, ReplyIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import { MessageId, type TurnId } from "@marcode/contracts";
import {
  buildQuoteFromPierreFileDiff,
  inferLanguageFromFilePath,
  type DiffQuoteResult,
} from "../lib/diffLineQuote";
import type { QuotedContext } from "../lib/quotedContext";
import { truncateQuotedText } from "../lib/quotedContext";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { randomUUID } from "../lib/utils";

interface DiffSelectionReplyToolbarProps {
  turnId: TurnId | null;
  viewportRef: React.RefObject<HTMLElement | null>;
  selectedFilePath: string | null;
  selectedFileDiff: FileDiffMetadata | null;
  selectedRange: SelectedLineRange | null;
  renderMode: "unified" | "split";
  onReply: (context: QuotedContext) => void;
  onClearSelection: () => void;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

const DIFF_SELECTION_SYNTHETIC_MESSAGE_ID = MessageId.make("diff-selection");

function findSelectedFileElement(
  viewport: HTMLElement,
  selectedFilePath: string,
): HTMLElement | null {
  return (
    Array.from(viewport.querySelectorAll<HTMLElement>("[data-diff-file-path]")).find(
      (element) => element.dataset.diffFilePath === selectedFilePath,
    ) ?? null
  );
}

function resolveToolbarPosition(
  viewport: HTMLElement,
  selectedFilePath: string,
): ToolbarPosition | null {
  const fileElement = findSelectedFileElement(viewport, selectedFilePath);
  const anchor = fileElement ?? viewport;
  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: Math.max(8, rect.top + 8),
    left: Math.max(8, rect.right - 12),
  };
}

export const DiffSelectionReplyToolbar = memo(function DiffSelectionReplyToolbar(
  props: DiffSelectionReplyToolbarProps,
) {
  const {
    turnId,
    viewportRef,
    selectedFilePath,
    selectedFileDiff,
    selectedRange,
    renderMode,
    onReply,
    onClearSelection,
  } = props;
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const quote = useMemo<DiffQuoteResult | null>(() => {
    if (!selectedFilePath || !selectedFileDiff || !selectedRange) return null;
    return buildQuoteFromPierreFileDiff({
      filePath: selectedFilePath,
      fileDiff: selectedFileDiff,
      selection: selectedRange,
      mode: renderMode,
    });
  }, [renderMode, selectedFileDiff, selectedFilePath, selectedRange]);

  useEffect(() => {
    if (!selectedFilePath || !selectedRange) {
      setPosition(null);
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updatePosition = () => {
      setPosition(resolveToolbarPosition(viewport, selectedFilePath));
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(viewport);
    const scrollParent = viewport.querySelector<HTMLElement>(".diff-render-surface") ?? viewport;
    scrollParent.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      resizeObserver.disconnect();
      scrollParent.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [selectedFilePath, selectedRange, viewportRef]);

  const handleReply = useCallback(() => {
    if (!selectedFilePath || !quote) return;
    const { text: rawText, wasTruncated } = truncateQuotedText(quote.text);
    if (wasTruncated) {
      console.warn("Quoted diff text was truncated to 5000 characters");
    }

    onReply({
      id: randomUUID(),
      messageId: DIFF_SELECTION_SYNTHETIC_MESSAGE_ID,
      turnId,
      source: "diff",
      text: rawText,
      codeLanguage: inferLanguageFromFilePath(selectedFilePath),
      filePath: selectedFilePath,
      lineStart: quote.lineStart,
      lineEnd: quote.lineEnd,
      selectionSide: quote.selectionSide,
    });
    onClearSelection();
  }, [onClearSelection, onReply, quote, selectedFilePath, turnId]);

  const handleCopy = useCallback(() => {
    if (quote) {
      copyToClipboard(quote.text);
    }
  }, [copyToClipboard, quote]);

  useEffect(() => {
    if (!selectedRange) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClearSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleReply();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleReply, onClearSelection, selectedRange]);

  if (!position || !quote) return null;

  return createPortal(
    <div
      className="pointer-events-auto z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 shadow-lg"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: "translateX(-100%)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        onClick={handleReply}
        title="Reply to selected lines (⌘⇧R)"
      >
        <ReplyIcon className="size-3" />
        Reply
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        onClick={handleCopy}
        title="Copy selected lines"
      >
        {isCopied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
        onClick={onClearSelection}
        title="Clear selection"
      >
        <XIcon className="size-3" />
      </button>
    </div>,
    document.body,
  );
});
