import type { EnvironmentId, ProjectId } from "@marcode/contracts";

import { ensureEnvironmentApi } from "../environmentApi";
import type { Project } from "../types";
import { newCommandId, newProjectId } from "./utils";

const DEFAULT_CHAT_TITLE = "New chat";

export function isChatProject(project: Pick<Project, "kind"> | null | undefined): boolean {
  return project?.kind === "chat";
}

/**
 * Dispatch a `project.create` command for a chat-kind project.
 *
 * - When `workspaceRoot` is omitted/empty, the server auto-allocates
 *   `<baseDir>/chats/<projectId>` and creates it on disk — the user doesn't
 *   need to pick a folder just to start chatting.
 * - When `workspaceRoot` is provided (e.g. the directory picker), the server
 *   creates the directory if it doesn't exist (`createWorkspaceRootIfMissing`
 *   is forced on for chat-kind in the server-side Normalizer).
 */
export async function createChatProject(input: {
  readonly environmentId: EnvironmentId;
  readonly title?: string;
  readonly workspaceRoot?: string | null;
}): Promise<ProjectId> {
  const api = ensureEnvironmentApi(input.environmentId);
  const projectId = newProjectId();
  const trimmedRoot = typeof input.workspaceRoot === "string" ? input.workspaceRoot.trim() : "";
  const title = input.title?.trim() || DEFAULT_CHAT_TITLE;

  await api.orchestration.dispatchCommand({
    type: "project.create",
    commandId: newCommandId(),
    projectId,
    kind: "chat",
    title,
    ...(trimmedRoot.length > 0 ? { workspaceRoot: trimmedRoot } : {}),
    createWorkspaceRootIfMissing: true,
    createdAt: new Date().toISOString(),
  });

  return projectId;
}
