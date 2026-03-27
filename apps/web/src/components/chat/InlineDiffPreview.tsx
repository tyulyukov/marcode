import {
  type DiffsHighlighter,
  getSharedHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "~/hooks/useTheme";
import { type DiffLine, type InlineDiffHunk } from "~/lib/inlineDiff";
import { resolveDiffThemeName } from "~/lib/diffRendering";
import { cn } from "~/lib/utils";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

function getHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [resolveDiffThemeName("dark"), resolveDiffThemeName("light")],
    langs: [language as SupportedLanguages],
    preferredHighlighter: "shiki-js",
  }).catch((err) => {
    highlighterPromiseCache.delete(language);
    if (language === "text") throw err;
    return getHighlighterPromise("text");
  });
  highlighterPromiseCache.set(language, promise);
  return promise;
}

function resolveLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return "text";
  const MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    mts: "typescript",
    cts: "typescript",
    py: "python",
    rs: "rust",
    go: "go",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    jsonc: "jsonc",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    mdx: "mdx",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    rb: "ruby",
    java: "java",
    swift: "swift",
    kt: "kotlin",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "c",
    hpp: "cpp",
    vue: "vue",
    svelte: "svelte",
    xml: "xml",
    svg: "xml",
    lua: "lua",
    php: "php",
    dart: "dart",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    r: "r",
    tf: "hcl",
    dockerfile: "dockerfile",
    graphql: "graphql",
    gql: "graphql",
    prisma: "prisma",
    proto: "protobuf",
  };
  return MAP[ext] ?? "text";
}

function extractLineHtmls(fullHtml: string): string[] {
  const codeStart = fullHtml.indexOf("<code");
  const codeEnd = fullHtml.lastIndexOf("</code>");
  if (codeStart === -1 || codeEnd === -1) return [];

  const codeTagClose = fullHtml.indexOf(">", codeStart);
  if (codeTagClose === -1) return [];

  const inner = fullHtml.slice(codeTagClose + 1, codeEnd);

  return inner.split("\n").map((raw) => {
    let line = raw;
    const openIdx = line.indexOf(">");
    if (line.startsWith("<span") && openIdx !== -1) {
      line = line.slice(openIdx + 1);
    }
    if (line.endsWith("</span>")) {
      line = line.slice(0, -7);
    }
    return line;
  });
}

function shortenPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-2).join("/")}`;
}

function buildLineKeys(lines: ReadonlyArray<DiffLine>): string[] {
  const counters = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.type}:${line.content}`;
    const count = counters.get(base) ?? 0;
    counters.set(base, count + 1);
    return `${base}:${count}`;
  });
}

const OPERATION_LABELS: Record<InlineDiffHunk["operation"], string> = {
  edit: "Edit",
  write: "Write",
};

function DiffStatSummary(props: { additions: number; deletions: number }) {
  const { additions, deletions } = props;
  if (additions === 0 && deletions === 0) return null;

  return (
    <span className="ml-auto flex shrink-0 gap-1.5 font-mono text-[10px]">
      {additions > 0 && (
        <span className="text-[color-mix(in_srgb,var(--success)_80%,var(--foreground))]">
          +{additions}
        </span>
      )}
      {deletions > 0 && (
        <span className="text-[color-mix(in_srgb,var(--destructive)_80%,var(--foreground))]">
          -{deletions}
        </span>
      )}
    </span>
  );
}

const LINE_BG: Record<DiffLine["type"], string> = {
  deletion: "bg-[color-mix(in_srgb,var(--background)_88%,var(--destructive))]",
  addition: "bg-[color-mix(in_srgb,var(--background)_88%,var(--success))]",
  context: "",
  separator: "",
};

const LINE_TEXT_PLAIN: Record<DiffLine["type"], string> = {
  deletion: "text-[color-mix(in_srgb,var(--foreground)_70%,var(--destructive))]",
  addition: "text-[color-mix(in_srgb,var(--foreground)_70%,var(--success))]",
  context: "text-muted-foreground/60",
  separator: "text-muted-foreground/30",
};

const MARKER_CHAR: Record<DiffLine["type"], string> = {
  deletion: "-",
  addition: "+",
  context: " ",
  separator: " ",
};

export const InlineDiffPreview = memo(function InlineDiffPreview(props: { hunk: InlineDiffHunk }) {
  const { hunk } = props;
  const [collapsed, setCollapsed] = useState(false);
  const { resolvedTheme } = useTheme();

  const keyedLines = useMemo(() => {
    const keys = buildLineKeys(hunk.lines);
    return hunk.lines.map((line, i) => ({ ...line, key: keys[i]! }));
  }, [hunk.lines]);

  const [lineHtmls, setLineHtmls] = useState<string[] | null>(null);
  const highlightVersionRef = useRef(0);

  useEffect(() => {
    const version = ++highlightVersionRef.current;
    const language = resolveLanguageFromPath(hunk.filePath);
    if (language === "text") return;

    const codeLineIndices: number[] = [];
    const codeFragments: string[] = [];
    for (let i = 0; i < hunk.lines.length; i++) {
      if (hunk.lines[i]!.type !== "separator") {
        codeLineIndices.push(i);
        codeFragments.push(hunk.lines[i]!.content);
      }
    }
    if (codeFragments.length === 0) return;

    const code = codeFragments.join("\n");
    const themeName = resolveDiffThemeName(resolvedTheme);

    getHighlighterPromise(language)
      .then((highlighter) => {
        if (highlightVersionRef.current !== version) return;
        try {
          const html = highlighter.codeToHtml(code, { lang: language, theme: themeName });
          const extracted = extractLineHtmls(html);
          if (extracted.length === codeFragments.length) {
            const mapped: (string | null)[] = Array(hunk.lines.length).fill(null) as (
              | string
              | null
            )[];
            for (let i = 0; i < codeLineIndices.length; i++) {
              mapped[codeLineIndices[i]!] = extracted[i]!;
            }
            setLineHtmls(mapped as string[]);
          }
        } catch {
          // noop
        }
      })
      .catch(() => {});
  }, [hunk.filePath, hunk.lines, resolvedTheme]);

  const CollapseIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-border/40 bg-background/60">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/30"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <CollapseIcon className="size-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate font-mono text-[10px] text-muted-foreground/70">
          {OPERATION_LABELS[hunk.operation]}({shortenPath(hunk.filePath)})
        </span>
        <DiffStatSummary additions={hunk.stats.additions} deletions={hunk.stats.deletions} />
      </button>

      {!collapsed && (
        <div className="relative overflow-hidden border-t border-border/30 max-h-[260px]">
          <div className="overflow-x-auto overflow-y-hidden">
            <pre className="m-0 p-0 text-[11px] leading-[18px]">
              {keyedLines.map((line, idx) => {
                if (line.type === "separator") {
                  return (
                    <div
                      key={line.key}
                      className="py-0.5 pl-1 text-center text-muted-foreground/30"
                    >
                      ···
                    </div>
                  );
                }
                const highlighted = lineHtmls?.[idx];
                return (
                  <div
                    key={line.key}
                    className={cn(
                      "pr-3 pl-1",
                      LINE_BG[line.type],
                      !highlighted && LINE_TEXT_PLAIN[line.type],
                    )}
                  >
                    <span className="mr-2 inline-block w-3 select-none text-center text-muted-foreground/40">
                      {MARKER_CHAR[line.type]}
                    </span>
                    {highlighted ? (
                      <span dangerouslySetInnerHTML={{ __html: highlighted }} />
                    ) : (
                      line.content
                    )}
                  </div>
                );
              })}
            </pre>
          </div>

          {hunk.truncated && (
            <div className="border-t border-border/30 px-2 py-0.5 text-center font-mono text-[10px] text-muted-foreground/40">
              ... diff truncated
            </div>
          )}

          {!hunk.truncated && hunk.lines.length > 14 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/80 to-transparent" />
          )}
        </div>
      )}
    </div>
  );
});
