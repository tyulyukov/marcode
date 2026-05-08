import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { type ProviderKind } from "@marcode/contracts";
import { useComposerDraftStore } from "../composerDraftStore";
import { ensureEnvironmentApi } from "../environmentApi";
import {
  buildThreadHandoffImportedMessages,
  canCreateThreadHandoff,
  resolveAvailableHandoffTargetProviders,
  resolveThreadHandoffModelSelection,
} from "../lib/threadHandoff";
import { newCommandId, newThreadId } from "../lib/utils";
import { isProviderEnabled } from "../providerModels";
import { useServerProviders } from "../rpc/serverState";
import { selectProjectByRef, useStore } from "../store";
import { buildThreadRouteParams } from "../threadRoutes";
import { type Thread } from "../types";
import { scopeProjectRef, scopeThreadRef } from "@marcode/client-runtime";

export function useThreadHandoff() {
  const navigate = useNavigate();
  const providers = useServerProviders();

  const createThreadHandoff = useCallback(
    async (thread: Thread, targetProvider: ProviderKind): Promise<Thread["id"]> => {
      const api = ensureEnvironmentApi(thread.environmentId);

      const project = selectProjectByRef(
        useStore.getState(),
        scopeProjectRef(thread.environmentId, thread.projectId),
      );
      if (!project) {
        throw new Error("Project not found for handoff thread.");
      }

      if (!canCreateThreadHandoff({ thread })) {
        throw new Error("This thread cannot be handed off yet.");
      }
      if (
        !resolveAvailableHandoffTargetProviders(thread.modelSelection.provider).includes(
          targetProvider,
        )
      ) {
        throw new Error("This handoff target is not available for the current thread.");
      }
      if (!isProviderEnabled(providers, targetProvider)) {
        throw new Error("This provider is not available yet.");
      }

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const importedMessages = buildThreadHandoffImportedMessages(thread);
      const stickyModelSelectionByProvider =
        useComposerDraftStore.getState().stickyModelSelectionByProvider ?? {};

      await api.orchestration.dispatchCommand({
        type: "thread.handoff.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        sourceThreadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        modelSelection: resolveThreadHandoffModelSelection({
          sourceThread: thread,
          targetProvider,
          projectDefaultModelSelection: project.defaultModelSelection,
          stickyModelSelectionByProvider,
        }),
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        associatedWorktreePath: thread.associatedWorktreePath ?? thread.worktreePath ?? null,
        associatedWorktreeBranch: thread.associatedWorktreeBranch ?? thread.branch ?? null,
        associatedWorktreeRef:
          thread.associatedWorktreeRef ?? thread.associatedWorktreeBranch ?? thread.branch ?? null,
        createBranchFlowCompleted: thread.createBranchFlowCompleted,
        importedMessages: [...importedMessages],
        createdAt,
      });

      // TODO: dispatch imported activities once `thread.activity.append` is added
      // to `ClientOrchestrationCommand` (currently server-internal only).
      // TODO: copy transferable composer state once `copyTransferableComposerState`
      // exists on `useComposerDraftStore`.

      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, nextThreadId)),
      });

      return nextThreadId;
    },
    [navigate, providers],
  );

  return {
    createThreadHandoff,
  };
}
