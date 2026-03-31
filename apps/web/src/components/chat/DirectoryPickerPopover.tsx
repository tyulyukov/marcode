import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { FolderSymlinkIcon, XIcon, FolderIcon, SearchIcon } from "lucide-react";
import type { ThreadId } from "@marcode/contracts";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { projectBrowseDirectoriesQueryOptions } from "~/lib/projectReactQuery";
import { readNativeApi } from "~/nativeApi";
import { cn, newCommandId } from "~/lib/utils";
import { basenameOfPath } from "~/vscode-icons";
import { VscodeEntryIcon } from "./VscodeEntryIcon";
import { useTheme } from "~/hooks/useTheme";

interface DirectoryPickerPopoverProps {
  threadId: ThreadId;
  projectCwd: string | null;
  additionalDirectories: readonly string[];
  disabled: boolean;
}

const BROWSE_DEBOUNCE_MS = 200;

function resolveAbsolutePath(cwd: string, relativePath: string): string {
  if (relativePath.startsWith("/")) return relativePath;
  const parts = `${cwd}/${relativePath}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== "." && part !== "") {
      resolved.push(part);
    }
  }
  return `/${resolved.join("/")}`;
}

export function DirectoryPickerPopover({
  threadId,
  projectCwd,
  additionalDirectories,
  disabled,
}: DirectoryPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { resolvedTheme } = useTheme();
  const [debouncedQuery] = useDebouncedValue(searchQuery, { wait: BROWSE_DEBOUNCE_MS });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const resultListRef = useRef<HTMLDivElement>(null);

  const browseQuery = useQuery(
    projectBrowseDirectoriesQueryOptions({
      cwd: projectCwd,
      pathQuery: debouncedQuery,
      enabled: open && projectCwd !== null,
    }),
  );

  const browsedDirectories = browseQuery.data?.entries;

  const filteredResults = useMemo(() => {
    if (!browsedDirectories) return [];
    const addedPaths = new Set(additionalDirectories);
    return browsedDirectories.filter((entry) => {
      const absolutePath = projectCwd ? resolveAbsolutePath(projectCwd, entry.path) : entry.path;
      return !addedPaths.has(absolutePath);
    });
  }, [browsedDirectories, additionalDirectories, projectCwd]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredResults]);

  const dispatchMetaUpdate = useCallback(
    async (nextDirs: string[]) => {
      const api = readNativeApi();
      if (!api) return;
      await api.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId,
        additionalDirectories: nextDirs,
      });
    },
    [threadId],
  );

  const addDirectory = useCallback(
    (relativePath: string) => {
      const absolutePath = projectCwd
        ? resolveAbsolutePath(projectCwd, relativePath)
        : relativePath;
      if (additionalDirectories.includes(absolutePath)) return;
      void dispatchMetaUpdate([...additionalDirectories, absolutePath]);
    },
    [additionalDirectories, dispatchMetaUpdate, projectCwd],
  );

  const removeDirectory = useCallback(
    (path: string) => {
      void dispatchMetaUpdate(additionalDirectories.filter((d) => d !== path));
    },
    [additionalDirectories, dispatchMetaUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev <= 0 ? filteredResults.length - 1 : prev - 1));
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const entry = filteredResults[highlightedIndex];
        if (entry) {
          addDirectory(entry.path);
        }
      }
    },
    [filteredResults, highlightedIndex, addDirectory],
  );

  useEffect(() => {
    if (highlightedIndex < 0 || !resultListRef.current) return;
    const highlighted = resultListRef.current.children[highlightedIndex] as HTMLElement | undefined;
    highlighted?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const count = additionalDirectories.length;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearchQuery("");
          setHighlightedIndex(-1);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="relative shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
            disabled={disabled}
            title="Add directories to context"
          >
            <FolderSymlinkIcon />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
                {count}
              </span>
            )}
          </Button>
        }
      />
      <PopoverPopup side="top" align="start" sideOffset={8} className="w-80">
        <div className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              className="w-full rounded-md border bg-transparent py-1.5 pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
              placeholder="Search directories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {additionalDirectories.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[11px] font-medium text-muted-foreground/60">
                Active directories
              </span>
              <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                {additionalDirectories.map((dirPath) => (
                  <div
                    key={dirPath}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50"
                  >
                    <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="min-w-0 flex-1 truncate" title={dirPath}>
                      {basenameOfPath(dirPath) || dirPath}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground"
                      onClick={() => removeDirectory(dirPath)}
                      aria-label={`Remove ${dirPath}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchQuery.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="px-1 text-[11px] font-medium text-muted-foreground/60">
                {browseQuery.isFetching ? "Searching..." : "Results"}
              </span>
              <div ref={resultListRef} className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {filteredResults.length === 0 && !browseQuery.isFetching ? (
                  <span className="px-1.5 py-1 text-xs text-muted-foreground/50">
                    No matching directories.
                  </span>
                ) : (
                  filteredResults.map((entry, index) => (
                    <button
                      key={entry.path}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm",
                        index === highlightedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => addDirectory(entry.path)}
                    >
                      <VscodeEntryIcon
                        pathValue={entry.path}
                        kind={entry.kind}
                        theme={resolvedTheme}
                        className="size-3.5"
                      />
                      <span className="min-w-0 flex-1 truncate" title={entry.path}>
                        {basenameOfPath(entry.path) || entry.path}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
