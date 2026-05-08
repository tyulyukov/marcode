import { scopeProjectRef } from "@marcode/client-runtime";
import type { EnvironmentId } from "@marcode/contracts";
import { useCallback } from "react";

import { createChatProject } from "../lib/chatProjects";
import { useStore } from "../store";
import { useNewThreadHandler } from "./useHandleNewThread";

export interface NewChatOptions {
  /** Optional cwd for the chat. Empty/null → server auto-creates `~/.marcode/chats/<id>`. */
  readonly workspaceRoot?: string | null;
  readonly title?: string;
  /** Defaults to the active environment when omitted. */
  readonly environmentId?: EnvironmentId;
}

/**
 * Create a fresh chat-kind project + initial thread, then route to it.
 *
 * Mirrors DPCode's `useHandleNewChat` but creates a per-chat project (with its
 * own scratch dir) instead of reusing a shared "Home" container project.
 */
export function useHandleNewChat() {
  const { handleNewThread } = useNewThreadHandler();

  return useCallback(
    async (options?: NewChatOptions): Promise<void> => {
      const environmentId = options?.environmentId ?? useStore.getState().activeEnvironmentId;
      if (!environmentId) {
        return;
      }

      const projectId = await createChatProject({
        environmentId,
        ...(options?.title !== undefined ? { title: options.title } : {}),
        ...(options?.workspaceRoot !== undefined ? { workspaceRoot: options.workspaceRoot } : {}),
      });

      await handleNewThread(scopeProjectRef(environmentId, projectId), {
        envMode: "local",
        worktreePath: null,
      });
    },
    [handleNewThread],
  );
}
