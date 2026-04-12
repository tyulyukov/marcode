import {
  type EnvironmentId,
  type ProjectId,
  type ScopedProjectRef,
  type ScopedThreadRef,
  type ThreadId,
} from "@marcode/contracts";
import { useMemo } from "react";
import {
  selectEnvironmentState,
  selectProjectsAcrossEnvironments,
  useStore,
  type AppState,
  type EnvironmentState,
} from "./store";
import { type Project, type SidebarThreadSummary, type Thread } from "./types";
import { getThreadFromEnvironmentState } from "./threadDerivation";

export function createProjectSelectorByRef(
  ref: ScopedProjectRef | null | undefined,
): (state: AppState) => Project | undefined {
  return (state) =>
    ref ? selectEnvironmentState(state, ref.environmentId).projectById[ref.projectId] : undefined;
}

export function createSidebarThreadSummarySelectorByRef(
  ref: ScopedThreadRef | null | undefined,
): (state: AppState) => SidebarThreadSummary | undefined {
  return (state) =>
    ref
      ? selectEnvironmentState(state, ref.environmentId).sidebarThreadSummaryById[ref.threadId]
      : undefined;
}

function createScopedThreadSelector(
  resolveRef: (state: AppState) => ScopedThreadRef | null | undefined,
): (state: AppState) => Thread | undefined {
  let previousEnvironmentState: EnvironmentState | undefined;
  let previousThreadId: ThreadId | undefined;
  let previousThread: Thread | undefined;

  return (state) => {
    const ref = resolveRef(state);
    if (!ref) {
      return undefined;
    }

    const environmentState = selectEnvironmentState(state, ref.environmentId);
    if (
      previousThread &&
      previousEnvironmentState === environmentState &&
      previousThreadId === ref.threadId
    ) {
      return previousThread;
    }

    previousEnvironmentState = environmentState;
    previousThreadId = ref.threadId;
    previousThread = getThreadFromEnvironmentState(environmentState, ref.threadId);
    return previousThread;
  };
}

export function createThreadSelectorByRef(
  ref: ScopedThreadRef | null | undefined,
): (state: AppState) => Thread | undefined {
  return createScopedThreadSelector(() => ref);
}

export function createThreadSelectorAcrossEnvironments(
  threadId: ThreadId | null | undefined,
): (state: AppState) => Thread | undefined {
  return createScopedThreadSelector((state) => {
    if (!threadId) {
      return undefined;
    }

    for (const [environmentId, environmentState] of Object.entries(
      state.environmentStateById,
    ) as Array<[ScopedThreadRef["environmentId"], EnvironmentState]>) {
      if (environmentState.threadShellById[threadId]) {
        return {
          environmentId,
          threadId,
        };
      }
    }
    return undefined;
  });
}

export function useThreadById(threadId: ThreadId | null | undefined): Thread | undefined {
  const selector = useMemo(() => createThreadSelectorAcrossEnvironments(threadId), [threadId]);
  return useStore(selector);
}

export function useProjectById(
  projectId: ProjectId | null | undefined,
  environmentId?: EnvironmentId | null,
): Project | undefined {
  return useStore((state) => {
    if (!projectId) return undefined;
    if (environmentId) {
      return selectEnvironmentState(state, environmentId).projectById[projectId];
    }
    return selectProjectsAcrossEnvironments(state).find((p) => p.id === projectId);
  });
}
