import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@marcode/contracts";
import { scopeThreadRef } from "@marcode/client-runtime";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import {
  ArrowRightIcon,
  DiffIcon,
  GitBranchIcon,
  ListTodoIcon,
  TerminalSquareIcon,
} from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useSyncedRelativeTimeTick } from "../../hooks/useRelativeTimeTick";
import { usePrimaryEnvironmentId } from "../../environments/primary";
import { cn } from "~/lib/utils";

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
  handoffActionTargetProviders: ReadonlyArray<ProviderKind>;
  handoffDisabled?: boolean;
  hideHandoffControls?: boolean;
  onCreateHandoff?: (target: ProviderKind) => void;
  handoffBadgeLabel?: string | null;
  handoffBadgeSourceProvider?: ProviderKind | null;
  handoffBadgeTargetProvider?: ProviderKind | null;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  onTogglePlanSidebar: () => void;
}

function renderProviderIcon(provider: ProviderKind | null, className: string) {
  if (provider === null) {
    return <GitBranchIcon className={className} />;
  }
  const Icon = PROVIDER_ICON_BY_PROVIDER[provider];
  return <Icon className={cn("text-foreground", className)} />;
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
  handoffActionTargetProviders,
  handoffDisabled = false,
  hideHandoffControls = false,
  onCreateHandoff,
  handoffBadgeLabel = null,
  handoffBadgeSourceProvider = null,
  handoffBadgeTargetProvider = null,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
  onTogglePlanSidebar,
}: ChatHeaderProps) {
  const relativeTimeNowMs = useSyncedRelativeTimeTick();
  const relativeActivityAt = activeThreadActivityAt
    ? formatRelativeTimeLabel(activeThreadActivityAt, relativeTimeNowMs)
    : null;
  const showMetaRow = Boolean(activeProjectName) || Boolean(relativeActivityAt);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const isRemoteEnvironment =
    primaryEnvironmentId !== null && activeThreadEnvironmentId !== primaryEnvironmentId;
  const showHandoffMenu =
    !hideHandoffControls && Boolean(onCreateHandoff) && handoffActionTargetProviders.length > 0;
  const showHandoffBadge = !hideHandoffControls && handoffBadgeLabel !== null;

  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
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
          {showHandoffBadge && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="hidden shrink-0 items-center gap-1 px-1.5 text-[10px] sm:inline-flex"
                  >
                    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                      {renderProviderIcon(handoffBadgeSourceProvider, "size-3")}
                    </span>
                    <ArrowRightIcon className="size-2.5 shrink-0 opacity-45" />
                    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                      {renderProviderIcon(handoffBadgeTargetProvider, "size-3")}
                    </span>
                  </Badge>
                }
              />
              <TooltipPopup side="bottom">{handoffBadgeLabel}</TooltipPopup>
            </Tooltip>
          )}
        </div>
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
        {showHandoffMenu && onCreateHandoff && (
          <Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    render={
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        aria-label="Hand off thread"
                        disabled={handoffDisabled}
                      />
                    }
                  >
                    <GitBranchIcon className="size-3" />
                    <span className="hidden font-normal @3xl/header-actions:inline">Hand off</span>
                  </MenuTrigger>
                }
              />
              <TooltipPopup side="bottom">Hand off thread</TooltipPopup>
            </Tooltip>
            <MenuPopup align="end" side="bottom" className="w-48">
              {handoffActionTargetProviders.map((provider) => (
                <MenuItem key={provider} onClick={() => onCreateHandoff(provider)}>
                  {renderProviderIcon(provider, "size-3.5 shrink-0")}
                  <span>Handoff to {PROVIDER_DISPLAY_NAMES[provider]}</span>
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        )}
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
        {activeProjectName && !isRemoteEnvironment && (
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
                disabled={!isGitRepo && !diffOpen}
              >
                <DiffIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!isGitRepo && !diffOpen
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
