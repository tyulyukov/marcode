import { scopeProjectRef, scopeThreadRef } from "@marcode/client-runtime";
import type { EnvironmentId, ProjectId, ThreadId } from "@marcode/contracts";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
  ChevronDownIcon,
  CloudIcon,
  FolderGit2Icon,
  FolderGitIcon,
  FolderIcon,
  MonitorIcon,
  SearchIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { ensureEnvironmentApi } from "../environmentApi";
import { useIsMobile } from "../hooks/useMediaQuery";
import { projectBrowseDirectoriesQueryOptions } from "../lib/projectReactQuery";
import { cn, newCommandId } from "../lib/utils";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import {
  type EnvMode,
  type EnvironmentOption,
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveEffectiveEnvMode,
  resolveLockedWorkspaceLabel,
} from "./BranchToolbar.logic";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import { BranchToolbarEnvironmentSelector } from "./BranchToolbarEnvironmentSelector";
import { BranchToolbarEnvModeSelector } from "./BranchToolbarEnvModeSelector";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";
import { stackedThreadToast, toastManager } from "./ui/toast";

const CHAT_WORKSPACE_BROWSE_ROOT = "/";
const CHAT_WORKSPACE_BROWSE_DEBOUNCE_MS = 200;

interface BranchToolbarProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId?: DraftId;
  onEnvModeChange: (mode: EnvMode) => void;
  effectiveEnvModeOverride?: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  envLocked: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
  availableEnvironments?: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
}

interface ChatWorkspaceSelectorProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  projectCwd: string;
}

function basenameOfPath(path: string): string {
  const parts = path.split(/[\\/]/);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part) {
      return part;
    }
  }
  return path;
}

const ChatWorkspaceSelector = memo(function ChatWorkspaceSelector({
  environmentId,
  projectId,
  projectCwd,
}: ChatWorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [debouncedQuery] = useDebouncedValue(pathInput, {
    wait: CHAT_WORKSPACE_BROWSE_DEBOUNCE_MS,
  });
  const browseQuery = useQuery(
    projectBrowseDirectoriesQueryOptions({
      environmentId,
      cwd: CHAT_WORKSPACE_BROWSE_ROOT,
      pathQuery: debouncedQuery,
      enabled: open,
    }),
  );

  const submitWorkspaceRoot = useCallback(
    async (workspaceRoot: string) => {
      const trimmed = workspaceRoot.trim();
      if (!trimmed) {
        return;
      }
      try {
        const api = ensureEnvironmentApi(environmentId);
        await api.orchestration.dispatchCommand({
          type: "project.meta.update",
          commandId: newCommandId(),
          projectId,
          workspaceRoot: trimmed,
        });
        setOpen(false);
        setPathInput("");
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to set chat directory",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [environmentId, projectId],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="xs" />}
        className="max-w-56 justify-start font-medium"
        aria-label="Chat directory"
      >
        <FolderIcon className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{basenameOfPath(projectCwd) || projectCwd}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverPopup align="start" side="top" className="w-80 max-w-none p-0">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              autoFocus
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                void submitWorkspaceRoot(pathInput);
              }}
              placeholder="/Users/you/some/folder"
              className="pl-8"
            />
          </div>
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {browseQuery.data?.entries.length === 0 ? (
              <span className="px-1 py-1 text-xs text-muted-foreground/50">
                Type an absolute directory path.
              </span>
            ) : (
              browseQuery.data?.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm",
                    "hover:bg-accent/50",
                  )}
                  onClick={() => {
                    setPathInput(entry.path);
                    void submitWorkspaceRoot(entry.path);
                  }}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="min-w-0 flex-1 truncate" title={entry.path}>
                    {entry.path}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
});

interface MobileRunContextSelectorProps {
  envLocked: boolean;
  envModeLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[] | undefined;
  showEnvironmentPicker: boolean;
  onEnvironmentChange: ((environmentId: EnvironmentId) => void) | undefined;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
}

const MobileRunContextSelector = memo(function MobileRunContextSelector({
  envLocked,
  envModeLocked,
  environmentId,
  availableEnvironments,
  showEnvironmentPicker,
  onEnvironmentChange,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
}: MobileRunContextSelectorProps) {
  const activeEnvironment = useMemo(
    () => availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null,
    [availableEnvironments, environmentId],
  );
  const environmentLabel = activeEnvironment?.label ?? "Run on";
  const EnvironmentIcon = activeEnvironment?.isPrimary ? MonitorIcon : CloudIcon;
  const WorkspaceIcon =
    effectiveEnvMode === "worktree"
      ? FolderGit2Icon
      : activeWorktreePath
        ? FolderGitIcon
        : FolderIcon;
  const workspaceLabel = envModeLocked
    ? resolveLockedWorkspaceLabel(activeWorktreePath)
    : effectiveEnvMode === "worktree"
      ? resolveEnvModeLabel("worktree")
      : resolveCurrentWorkspaceLabel(activeWorktreePath);

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="xs" />}
        className="min-w-0 max-w-[48%] flex-1 justify-start text-muted-foreground/70 hover:text-foreground/80 md:hidden"
      >
        {showEnvironmentPicker ? (
          <>
            <EnvironmentIcon className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{environmentLabel}</span>
          </>
        ) : (
          <>
            <WorkspaceIcon className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{workspaceLabel}</span>
          </>
        )}
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="w-64">
        {showEnvironmentPicker && availableEnvironments && onEnvironmentChange ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Run on</MenuGroupLabel>
              <MenuRadioGroup
                value={environmentId}
                onValueChange={(value) => onEnvironmentChange(value as EnvironmentId)}
              >
                {availableEnvironments.map((env) => {
                  const Icon = env.isPrimary ? MonitorIcon : CloudIcon;
                  return (
                    <MenuRadioItem
                      key={env.environmentId}
                      disabled={envLocked}
                      value={env.environmentId}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon className="size-3" />
                        <span className="min-w-0 truncate">{env.label}</span>
                      </span>
                    </MenuRadioItem>
                  );
                })}
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        <MenuGroup>
          <MenuGroupLabel>Workspace</MenuGroupLabel>
          <MenuRadioGroup
            value={effectiveEnvMode}
            onValueChange={(value) => onEnvModeChange(value as EnvMode)}
          >
            <MenuRadioItem disabled={envModeLocked} value="local">
              <span className="flex min-w-0 items-center gap-1.5">
                {activeWorktreePath ? (
                  <FolderGitIcon className="size-3" />
                ) : (
                  <FolderIcon className="size-3" />
                )}
                <span className="min-w-0 truncate">
                  {resolveCurrentWorkspaceLabel(activeWorktreePath)}
                </span>
              </span>
            </MenuRadioItem>
            <MenuRadioItem disabled={envModeLocked} value="worktree">
              <span className="flex min-w-0 items-center gap-1.5">
                <FolderGit2Icon className="size-3" />
                <span className="min-w-0 truncate">{resolveEnvModeLabel("worktree")}</span>
              </span>
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});

export const BranchToolbar = memo(function BranchToolbar({
  environmentId,
  threadId,
  draftId,
  onEnvModeChange,
  effectiveEnvModeOverride,
  activeThreadBranchOverride,
  onActiveThreadBranchOverrideChange,
  envLocked,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
  availableEnvironments,
  onEnvironmentChange,
}: BranchToolbarProps) {
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const serverThreadSelector = useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]);
  const serverThread = useStore(serverThreadSelector);
  const draftThread = useComposerDraftStore((store) =>
    draftId ? store.getDraftSession(draftId) : store.getDraftThreadByRef(threadRef),
  );
  const activeProjectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const activeProjectSelector = useMemo(
    () => createProjectSelectorByRef(activeProjectRef),
    [activeProjectRef],
  );
  const activeProject = useStore(activeProjectSelector);
  const hasActiveThread = serverThread !== undefined || draftThread !== null;
  const activeWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const effectiveEnvMode =
    effectiveEnvModeOverride ??
    resolveEffectiveEnvMode({
      activeWorktreePath,
      hasServerThread: serverThread !== undefined,
      draftThreadEnvMode: draftThread?.envMode,
    });
  const envModeLocked = envLocked || (serverThread !== undefined && activeWorktreePath !== null);

  const showEnvironmentPicker = Boolean(
    availableEnvironments && availableEnvironments.length > 1 && onEnvironmentChange,
  );
  const isMobile = useIsMobile();

  if (!hasActiveThread || !activeProject) return null;
  const isDraftChat = activeProject.kind === "chat" && serverThread === undefined;

  return (
    <div className="mx-auto flex w-full max-w-208 items-center gap-2 px-2.5 pb-3 pt-1 sm:px-3">
      {isMobile ? (
        <MobileRunContextSelector
          envLocked={envLocked}
          envModeLocked={envModeLocked}
          environmentId={environmentId}
          availableEnvironments={availableEnvironments}
          showEnvironmentPicker={showEnvironmentPicker}
          onEnvironmentChange={onEnvironmentChange}
          effectiveEnvMode={effectiveEnvMode}
          activeWorktreePath={activeWorktreePath}
          onEnvModeChange={onEnvModeChange}
        />
      ) : (
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {showEnvironmentPicker && availableEnvironments && onEnvironmentChange && (
            <>
              <BranchToolbarEnvironmentSelector
                envLocked={envLocked}
                environmentId={environmentId}
                availableEnvironments={availableEnvironments}
                onEnvironmentChange={onEnvironmentChange}
              />
              <Separator orientation="vertical" className="mx-0.5 h-3.5!" />
            </>
          )}
          {isDraftChat ? (
            <ChatWorkspaceSelector
              environmentId={activeProject.environmentId}
              projectId={activeProject.id}
              projectCwd={activeProject.cwd}
            />
          ) : (
            <BranchToolbarEnvModeSelector
              envLocked={envModeLocked}
              effectiveEnvMode={effectiveEnvMode}
              activeWorktreePath={activeWorktreePath}
              onEnvModeChange={onEnvModeChange}
            />
          )}
        </div>
      )}

      <BranchToolbarBranchSelector
        className="min-w-0 flex-1 justify-end md:ml-auto md:flex-none"
        environmentId={environmentId}
        threadId={threadId}
        {...(draftId ? { draftId } : {})}
        envLocked={envLocked}
        {...(effectiveEnvModeOverride ? { effectiveEnvModeOverride } : {})}
        {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
        {...(onActiveThreadBranchOverrideChange ? { onActiveThreadBranchOverrideChange } : {})}
        {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
        {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
      />
    </div>
  );
});
