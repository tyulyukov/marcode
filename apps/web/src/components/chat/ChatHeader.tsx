import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@marcode/contracts";
import { scopeThreadRef } from "@marcode/client-runtime";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { DiffIcon, ListTodoIcon, TerminalSquareIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useSyncedRelativeTimeTick } from "../../hooks/useRelativeTimeTick";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeThreadActivityAt: string | undefined;
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  diffOpen: boolean;
  hasPlan: boolean;
  planSidebarOpen: boolean;
  planSidebarLabel: string;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  onTogglePlanSidebar: () => void;
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeThreadTitle,
  activeThreadActivityAt,
  activeProjectName,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  diffToggleShortcutLabel,
  gitCwd,
  diffOpen,
  hasPlan,
  planSidebarOpen,
  planSidebarLabel,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
  onTogglePlanSidebar,
}: ChatHeaderProps) {
  useSyncedRelativeTimeTick();
  const relativeActivityAt = activeThreadActivityAt
    ? formatRelativeTimeLabel(activeThreadActivityAt)
    : null;
  const showMetaRow = Boolean(activeProjectName) || Boolean(relativeActivityAt);
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
        <Tooltip>
          <TooltipTrigger
            render={
              <h2 className="min-w-0 truncate text-sm font-medium text-foreground">
                {activeThreadTitle}
              </h2>
            }
          />
          <TooltipPopup
            side="bottom"
            className="max-w-lg break-words whitespace-pre-wrap leading-tight"
          >
            {activeThreadTitle}
          </TooltipPopup>
        </Tooltip>
        {showMetaRow && (
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            {activeProjectName && <span className="min-w-0 truncate">{activeProjectName}</span>}
            {activeProjectName && relativeActivityAt && (
              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                ·
              </span>
            )}
            {relativeActivityAt && <span className="shrink-0">{relativeActivityAt}</span>}
            {activeProjectName && !isGitRepo && (
              <>
                <span aria-hidden className="shrink-0 text-muted-foreground/40">
                  ·
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="shrink-0 text-amber-600/80 dark:text-amber-400/80">
                        No Git
                      </span>
                    }
                  />
                  <TooltipPopup side="bottom">This project is not a git repository.</TooltipPopup>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3">
        {activeProjectScripts && (
          <ProjectScriptsControl
            scripts={activeProjectScripts}
            keybindings={keybindings}
            preferredScriptId={preferredScriptId}
            onRunScript={onRunProjectScript}
            onAddScript={onAddProjectScript}
            onUpdateScript={onUpdateProjectScript}
            onDeleteScript={onDeleteProjectScript}
          />
        )}
        {activeProjectName && (
          <OpenInPicker
            keybindings={keybindings}
            availableEditors={availableEditors}
            openInCwd={openInCwd}
          />
        )}
        {activeProjectName && (
          <GitActionsControl
            gitCwd={gitCwd}
            activeThreadRef={scopeThreadRef(activeThreadEnvironmentId, activeThreadId)}
            {...(draftId ? { draftId } : {})}
          />
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={terminalOpen}
                onPressedChange={onToggleTerminal}
                aria-label="Toggle terminal drawer"
                variant="outline"
                size="xs"
                disabled={!terminalAvailable}
              >
                <TerminalSquareIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!terminalAvailable
              ? "Terminal is unavailable until this thread has an active project."
              : terminalToggleShortcutLabel
                ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                : "Toggle terminal drawer"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={diffOpen}
                onPressedChange={onToggleDiff}
                aria-label="Toggle diff panel"
                variant="outline"
                size="xs"
                disabled={!isGitRepo}
              >
                <DiffIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!isGitRepo
              ? "Diff panel is unavailable because this project is not a git repository."
              : diffToggleShortcutLabel
                ? `Toggle diff panel (${diffToggleShortcutLabel})`
                : "Toggle diff panel"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={planSidebarOpen}
                onPressedChange={onTogglePlanSidebar}
                aria-label={`Toggle ${planSidebarLabel.toLowerCase()} sidebar`}
                variant="outline"
                size="xs"
                disabled={!hasPlan}
              >
                <ListTodoIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!hasPlan
              ? `No ${planSidebarLabel.toLowerCase()} available`
              : planSidebarOpen
                ? `Hide ${planSidebarLabel.toLowerCase()} sidebar`
                : `Show ${planSidebarLabel.toLowerCase()} sidebar`}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
