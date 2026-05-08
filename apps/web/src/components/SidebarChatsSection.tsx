import { scopeThreadRef } from "@marcode/client-runtime";
import { type SidebarThreadSortOrder } from "@marcode/contracts/settings";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArrowUpDownIcon, ChevronDownIcon, MessageSquarePlusIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { useHandleNewChat } from "~/hooks/useHandleNewChat";
import { useThreadActions } from "~/hooks/useThreadActions";
import { toSortableTimestamp } from "~/lib/threadSort";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "~/components/ui/menu";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  selectBootstrapCompleteForActiveEnvironment,
  selectChatsAcrossEnvironments,
  selectThreadShellsAcrossEnvironments,
  useStore,
} from "~/store";
import { buildThreadRouteParams } from "~/threadRoutes";
import type { Project, ThreadShell } from "~/types";

const CHAT_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};

const CHATS_LIST_MAX_HEIGHT_CLASS = "max-h-56";

function getChatSortTimestamp(chat: Project, sortOrder: SidebarThreadSortOrder): number {
  if (sortOrder === "created_at") {
    return toSortableTimestamp(chat.createdAt) ?? Number.NEGATIVE_INFINITY;
  }
  return toSortableTimestamp(chat.updatedAt ?? chat.createdAt) ?? Number.NEGATIVE_INFINITY;
}

interface VisibleChat {
  readonly project: Project;
  readonly thread: ThreadShell;
}

export const SidebarChatsSection = memo(function SidebarChatsSection() {
  const chats = useStore(useShallow(selectChatsAcrossEnvironments));
  const threads = useStore(useShallow(selectThreadShellsAcrossEnvironments));
  const bootstrapComplete = useStore(selectBootstrapCompleteForActiveEnvironment);
  const sortOrder = useSettings<SidebarThreadSortOrder>(
    (settings) => settings.sidebarThreadSortOrder,
  );
  const confirmThreadArchive = useSettings<boolean>((settings) => settings.confirmThreadArchive);
  const { updateSettings } = useUpdateSettings();
  const { archiveThread } = useThreadActions();
  const handleNewChat = useHandleNewChat();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [confirmingArchiveThreadId, setConfirmingArchiveThreadId] = useState<string | null>(null);

  const visibleChats = useMemo<VisibleChat[]>(() => {
    return chats
      .flatMap((chat) => {
        const chatThreads = threads
          .filter(
            (thread) =>
              thread.environmentId === chat.environmentId &&
              thread.projectId === chat.id &&
              thread.archivedAt === null,
          )
          .toSorted((left, right) =>
            (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt),
          );
        const thread = chatThreads[0];
        return thread ? [{ project: chat, thread }] : [];
      })
      .toSorted((left, right) => {
        const rightTimestamp = getChatSortTimestamp(right.project, sortOrder);
        const leftTimestamp = getChatSortTimestamp(left.project, sortOrder);
        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp > leftTimestamp ? 1 : -1;
        }
        return right.project.id.localeCompare(left.project.id);
      });
  }, [chats, sortOrder, threads]);

  const handleSortOrderChange = useCallback(
    (next: SidebarThreadSortOrder) => {
      updateSettings({ sidebarThreadSortOrder: next });
    },
    [updateSettings],
  );

  const handleChatClick = useCallback(
    (chat: VisibleChat) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(chat.thread.environmentId, chat.thread.id)),
      });
    },
    [navigate],
  );

  const handleArchive = useCallback(
    (chat: VisibleChat) => {
      setConfirmingArchiveThreadId(null);
      void archiveThread(scopeThreadRef(chat.thread.environmentId, chat.thread.id));
    },
    [archiveThread],
  );

  const isLoading = !bootstrapComplete && visibleChats.length === 0;

  return (
    <div className="flex shrink-0 flex-col">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <CollapsibleTrigger className="flex min-w-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-foreground">
            <ChevronDownIcon
              className={`size-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
            <span>Chats</span>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            <Menu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <MenuTrigger className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
                  }
                >
                  <ArrowUpDownIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="top">Sort chats</TooltipPopup>
              </Tooltip>
              <MenuPopup align="end" side="top" className="min-w-44">
                <MenuGroup>
                  <div className="px-2 py-1 font-medium text-muted-foreground sm:text-xs">
                    Sort chats
                  </div>
                  <MenuRadioGroup
                    value={sortOrder}
                    onValueChange={(value) => {
                      handleSortOrderChange(value as SidebarThreadSortOrder);
                    }}
                  >
                    {(
                      Object.entries(CHAT_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
                    ).map(([value, label]) => (
                      <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                        {label}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
              </MenuPopup>
            </Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="New chat"
                    data-testid="sidebar-new-chat-trigger"
                    className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void handleNewChat()}
                  />
                }
              >
                <MessageSquarePlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">New chat</TooltipPopup>
            </Tooltip>
          </div>
        </div>
        <CollapsiblePanel>
          {isLoading ? (
            <div className="flex flex-col gap-1 px-2 pb-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1">
                  <Skeleton className="size-3.5 shrink-0 rounded" />
                  <Skeleton
                    className={`h-3.5 rounded ${i === 0 ? "w-32" : i === 1 ? "w-24" : "w-28"}`}
                  />
                </div>
              ))}
            </div>
          ) : visibleChats.length === 0 ? (
            <div className="px-4 pb-3 text-xs text-muted-foreground/50">No chats</div>
          ) : (
            <ScrollArea
              hideScrollbars
              scrollFade
              className={`${CHATS_LIST_MAX_HEIGHT_CLASS} px-2 pb-2`}
            >
              <SidebarMenu>
                {visibleChats.map((chat) => {
                  const isConfirming = confirmingArchiveThreadId === chat.thread.id;
                  return (
                    <SidebarMenuItem
                      key={`${chat.project.environmentId}:${chat.project.id}`}
                      className="group/chat-item"
                      onMouseLeave={() => setConfirmingArchiveThreadId(null)}
                    >
                      <SidebarMenuButton
                        size="sm"
                        className="relative gap-2 px-2"
                        onClick={() => handleChatClick(chat)}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-left"
                          title={chat.project.cwd}
                        >
                          {chat.thread.title}
                        </span>
                        {isConfirming ? (
                          <button
                            type="button"
                            data-testid={`chat-archive-confirm-${chat.thread.id}`}
                            aria-label={`Confirm archive ${chat.thread.title}`}
                            className="absolute top-1/2 right-1 inline-flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-full bg-destructive/12 px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/18 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-destructive/40"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleArchive(chat);
                            }}
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-testid={`chat-archive-${chat.thread.id}`}
                            aria-label={`Archive ${chat.thread.title}`}
                            className="pointer-events-none absolute top-1/2 right-1 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground/60 opacity-0 transition-[color,opacity] hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring group-hover/chat-item:pointer-events-auto group-hover/chat-item:opacity-100 group-focus-within/chat-item:pointer-events-auto group-focus-within/chat-item:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (confirmThreadArchive) {
                                setConfirmingArchiveThreadId(chat.thread.id);
                              } else {
                                handleArchive(chat);
                              }
                            }}
                          >
                            <ArchiveIcon className="size-3.5" />
                          </button>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </ScrollArea>
          )}
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
});
