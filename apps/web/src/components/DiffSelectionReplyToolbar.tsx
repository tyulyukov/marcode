import { CheckIcon, CopyIcon, ReplyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageId, type TurnId } from "@marcode/contracts";
import type { QuotedContext } from "../lib/quotedContext";
import { truncateQuotedText } from "../lib/quotedContext";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { randomUUID } from "../lib/utils";

interface DiffSelectionReplyToolbarProps {
  turnId: TurnId | null;
  viewportRef: React.RefObject<HTMLElement | null>;
  onReply: (context: QuotedContext) => void;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

const TOOLBAR_HEIGHT_PX = 32;
const TOOLBAR_GAP_PX = 6;

const DIFF_SELECTION_SYNTHETIC_MESSAGE_ID = MessageId.makeUnsafe("diff-selection");

function collectShadowRoots(container: HTMLElement): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const walk = (el: Element) => {
    if (el.shadowRoot) roots.push(el.shadowRoot);
    for (const child of el.children) walk(child);
  };
  walk(container);
  return roots;
}

function escapeToLightDom(node: Node): Node {
  let current: Node = node;
  let root = current.getRootNode();
  while (root instanceof ShadowRoot) {
    current = root.host;
    root = current.getRootNode();
  }
  return current;
}

function findDiffFilePath(node: Node): string | null {
  let current: Element | null = node instanceof Element ? node : node.parentElement;

  const lightNode = escapeToLightDom(node);
  if (lightNode instanceof Element) {
    current = lightNode;
  }

  while (current) {
    const filePath = current.getAttribute("data-diff-file-path");
    if (filePath) return filePath;
    current = current.parentElement;
  }
  return null;
}

function inferLanguageFromFilePath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;

  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    css: "css",
    scss: "scss",
    html: "html",
    vue: "vue",
    svelte: "svelte",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    lua: "lua",
    zig: "zig",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    ml: "ocaml",
    graphql: "graphql",
    gql: "graphql",
    proto: "protobuf",
    dart: "dart",
    r: "r",
    scala: "scala",
    tf: "terraform",
    dockerfile: "dockerfile",
  };

  return extMap[ext];
}

function getSelectedTextInViewport(viewportEl: HTMLElement): {
  text: string;
  anchorNode: Node | null;
} | null {
  const selection = document.getSelection();
  if (!selection) return null;

  const text = selection.toString().trim();
  if (text.length === 0) return null;

  const shadowRoots = collectShadowRoots(viewportEl);

  let anchorNode: Node | null = null;
  if ("getComposedRanges" in selection && typeof selection.getComposedRanges === "function") {
    const composedRanges = (
      selection as Selection & {
        getComposedRanges: (...roots: ShadowRoot[]) => StaticRange[];
      }
    ).getComposedRanges(...shadowRoots);
    if (composedRanges.length > 0) {
      anchorNode = composedRanges[0]!.startContainer;
    }
  }

  if (!anchorNode && !selection.isCollapsed && selection.rangeCount > 0) {
    anchorNode = selection.anchorNode;
  }

  return { text, anchorNode };
}

export const DiffSelectionReplyToolbar = memo(function DiffSelectionReplyToolbar(
  props: DiffSelectionReplyToolbarProps,
) {
  const { turnId, viewportRef, onReply } = props;
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onMouseMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const checkSelection = () => {
      const snap = getSelectedTextInViewport(viewport);
      const mouse = lastMouseRef.current;
      if (!snap || !mouse) {
        setPosition(null);
        return;
      }
      const viewportRect = viewport.getBoundingClientRect();
      if (
        mouse.x < viewportRect.left ||
        mouse.x > viewportRect.right ||
        mouse.y < viewportRect.top ||
        mouse.y > viewportRect.bottom
      ) {
        setPosition(null);
        return;
      }
      setPosition({
        top: mouse.y - TOOLBAR_HEIGHT_PX - TOOLBAR_GAP_PX,
        left: mouse.x,
      });
    };

    const onMouseUp = () => {
      requestAnimationFrame(checkSelection);
    };

    const onSelectionChange = () => {
      const selection = document.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length === 0) {
        setPosition(null);
      }
    };

    document.addEventListener("selectionchange", onSelectionChange);
    viewport.addEventListener("mousemove", onMouseMove);
    viewport.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      viewport.removeEventListener("mousemove", onMouseMove);
      viewport.removeEventListener("mouseup", onMouseUp);
    };
  }, [viewportRef]);

  const handleReply = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const snap = getSelectedTextInViewport(viewport);
    if (!snap) return;

    const { text: rawText, wasTruncated } = truncateQuotedText(snap.text);
    if (wasTruncated) {
      console.warn("Quoted diff text was truncated to 5000 characters");
    }

    const filePath = snap.anchorNode ? findDiffFilePath(snap.anchorNode) : null;
    const codeLanguage = filePath ? inferLanguageFromFilePath(filePath) : undefined;

    const context: QuotedContext = {
      id: randomUUID(),
      messageId: DIFF_SELECTION_SYNTHETIC_MESSAGE_ID,
      turnId,
      text: rawText,
      codeLanguage,
      filePath: filePath ?? undefined,
    };

    onReply(context);
    window.getSelection()?.removeAllRanges();
    setPosition(null);
  }, [viewportRef, turnId, onReply]);

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
