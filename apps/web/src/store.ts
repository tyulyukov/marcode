import { Fragment, type ReactNode, createElement, useEffect } from "react";
import {
  type ProviderKind,
  ThreadId,
  type MessageId,
  type TurnId,
  type CheckpointRef,
  type OrchestrationReadModel,
  type OrchestrationSessionStatus,
  type OrchestrationCheckpointStatus,
  type OrchestrationSession,
  type OrchestrationThreadActivity,
  type OrchestrationProposedPlan,
} from "@marcode/contracts";
import { resolveModelSlugForProvider } from "@marcode/shared/model";
import { create } from "zustand";
import { type ChatMessage, type Project, type Thread, type ThreadSession } from "./types";
import { Debouncer } from "@tanstack/react-pacer";

// ── State ────────────────────────────────────────────────────────────

export interface AppState {
  projects: Project[];
  threads: Thread[];
  threadsHydrated: boolean;
}

const PERSISTED_STATE_KEY = "marcode:renderer-state:v8";
const LEGACY_PERSISTED_STATE_KEYS = [
  "marcode:renderer-state:v7",
  "marcode:renderer-state:v6",
  "marcode:renderer-state:v5",
  "marcode:renderer-state:v4",
  "marcode:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

const initialState: AppState = {
  projects: [],
  threads: [],
  threadsHydrated: false,
};
const persistedExpandedProjectCwds = new Set<string>();
const persistedProjectOrderCwds: string[] = [];

// ── Persist helpers ──────────────────────────────────────────────────

function readPersistedState(): AppState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as {
      expandedProjectCwds?: string[];
      projectOrderCwds?: string[];
    };
    persistedExpandedProjectCwds.clear();
    persistedProjectOrderCwds.length = 0;
    for (const cwd of parsed.expandedProjectCwds ?? []) {
      if (typeof cwd === "string" && cwd.length > 0) {
        persistedExpandedProjectCwds.add(cwd);
      }
    }
    for (const cwd of parsed.projectOrderCwds ?? []) {
      if (typeof cwd === "string" && cwd.length > 0 && !persistedProjectOrderCwds.includes(cwd)) {
        persistedProjectOrderCwds.push(cwd);
      }
    }
    return { ...initialState };
  } catch {
    return initialState;
  }
}

let legacyKeysCleanedUp = false;

function persistState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        expandedProjectCwds: state.projects
          .filter((project) => project.expanded)
          .map((project) => project.cwd),
        projectOrderCwds: state.projects.map((project) => project.cwd),
      }),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}
const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

// ── Pure helpers ──────────────────────────────────────────────────────

function updateThread(
  threads: Thread[],
  threadId: ThreadId,
  updater: (t: Thread) => Thread,
): Thread[] {
  let changed = false;
  const next = threads.map((t) => {
    if (t.id !== threadId) return t;
    const updated = updater(t);
    if (updated !== t) changed = true;
    return updated;
  });
  return changed ? next : threads;
}

function mapProjectsFromReadModel(
  incoming: OrchestrationReadModel["projects"],
  previous: Project[],
): Project[] {
  const previousById = new Map(previous.map((project) => [project.id, project] as const));
  const previousByCwd = new Map(previous.map((project) => [project.cwd, project] as const));
  const previousOrderById = new Map(previous.map((project, index) => [project.id, index] as const));
  const previousOrderByCwd = new Map(
    previous.map((project, index) => [project.cwd, index] as const),
  );
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const usePersistedOrder = previous.length === 0;

  const mappedProjects = incoming.map((project) => {
    const existing = previousById.get(project.id) ?? previousByCwd.get(project.workspaceRoot);
    return {
      id: project.id,
      name: project.title,
      cwd: project.workspaceRoot,
      defaultModelSelection:
        existing?.defaultModelSelection ??
        (project.defaultModelSelection
          ? {
              ...project.defaultModelSelection,
              model: resolveModelSlugForProvider(
                project.defaultModelSelection.provider,
                project.defaultModelSelection.model,
              ),
            }
          : null),
      expanded:
        existing?.expanded ??
        (persistedExpandedProjectCwds.size > 0
          ? persistedExpandedProjectCwds.has(project.workspaceRoot)
          : true),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      scripts: project.scripts.map((script) => ({ ...script })),
      jiraBoard: project.jiraBoard ?? null,
    } satisfies Project;
  });

  const sortedProjects = mappedProjects
    .map((project, incomingIndex) => {
      const previousIndex =
        previousOrderById.get(project.id) ?? previousOrderByCwd.get(project.cwd);
      const persistedIndex = usePersistedOrder ? persistedOrderByCwd.get(project.cwd) : undefined;
      const orderIndex =
        previousIndex ??
        persistedIndex ??
        (usePersistedOrder ? persistedProjectOrderCwds.length : previous.length) + incomingIndex;
      return { project, incomingIndex, orderIndex };
    })
    .toSorted((a, b) => {
      const byOrder = a.orderIndex - b.orderIndex;
      if (byOrder !== 0) return byOrder;
      return a.incomingIndex - b.incomingIndex;
    })
    .map((entry) => entry.project);

  return sortedProjects.map((project) => {
    const existing = previousById.get(project.id) ?? previousByCwd.get(project.cwd);
    if (existing && !projectChanged(existing, project)) {
      return existing;
    }
    return project;
  });
}

function toLegacySessionStatus(
  status: OrchestrationSessionStatus,
): "connecting" | "ready" | "running" | "error" | "closed" {
  switch (status) {
    case "starting":
      return "connecting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "ready":
    case "interrupted":
      return "ready";
    case "idle":
    case "stopped":
      return "closed";
  }
}

function toLegacyProvider(providerName: string | null): ProviderKind {
  if (providerName === "codex" || providerName === "claudeAgent") {
    return providerName;
  }
  return "codex";
}

function resolveWsHttpOrigin(): string {
  if (typeof window === "undefined") return "";
  const bridgeWsUrl = window.desktopBridge?.getWsUrl?.();
  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsCandidate =
    typeof bridgeWsUrl === "string" && bridgeWsUrl.length > 0
      ? bridgeWsUrl
      : typeof envWsUrl === "string" && envWsUrl.length > 0
        ? envWsUrl
        : null;
  if (!wsCandidate) return window.location.origin;
  try {
    const wsUrl = new URL(wsCandidate);
    const protocol =
      wsUrl.protocol === "wss:" ? "https:" : wsUrl.protocol === "ws:" ? "http:" : wsUrl.protocol;
    return `${protocol}//${wsUrl.host}`;
  } catch {
    return window.location.origin;
  }
}

function toAttachmentPreviewUrl(rawUrl: string): string {
  if (rawUrl.startsWith("/")) {
    return `${resolveWsHttpOrigin()}${rawUrl}`;
  }
  return rawUrl;
}

function attachmentPreviewRoutePath(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

// ── Structural sharing helpers ────────────────────────────────────────

function sessionChanged(prev: ThreadSession | null, next: ThreadSession | null): boolean {
  if (prev === null && next === null) return false;
  if (prev === null || next === null) return true;
  return (
    prev.provider !== next.provider ||
    prev.status !== next.status ||
    prev.orchestrationStatus !== next.orchestrationStatus ||
    prev.activeTurnId !== next.activeTurnId ||
    prev.createdAt !== next.createdAt ||
    prev.updatedAt !== next.updatedAt ||
    prev.lastError !== next.lastError
  );
}

function threadChanged(prev: Thread, next: Thread): boolean {
  return (
    prev.title !== next.title ||
    prev.updatedAt !== next.updatedAt ||
    prev.archivedAt !== next.archivedAt ||
    prev.error !== next.error ||
    prev.branch !== next.branch ||
    prev.worktreePath !== next.worktreePath ||
    prev.runtimeMode !== next.runtimeMode ||
    prev.interactionMode !== next.interactionMode ||
    prev.modelSelection.provider !== next.modelSelection.provider ||
    prev.modelSelection.model !== next.modelSelection.model ||
    sessionChanged(prev.session, next.session) ||
    prev.messages.length !== next.messages.length ||
    prev.activities.length !== next.activities.length ||
    prev.proposedPlans.length !== next.proposedPlans.length ||
    prev.turnDiffSummaries.length !== next.turnDiffSummaries.length ||
    prev.latestTurn?.turnId !== next.latestTurn?.turnId ||
    prev.latestTurn?.state !== next.latestTurn?.state ||
    prev.latestTurn?.completedAt !== next.latestTurn?.completedAt
  );
}

function projectChanged(prev: Project, next: Project): boolean {
  return (
    prev.name !== next.name ||
    prev.cwd !== next.cwd ||
    prev.updatedAt !== next.updatedAt ||
    prev.expanded !== next.expanded ||
    prev.jiraBoard !== next.jiraBoard ||
    prev.scripts.length !== next.scripts.length ||
    prev.defaultModelSelection?.provider !== next.defaultModelSelection?.provider ||
    prev.defaultModelSelection?.model !== next.defaultModelSelection?.model
  );
}

const MAX_THREAD_MESSAGES = 2_000;
const MAX_THREAD_ACTIVITIES = 500;
const MAX_THREAD_CHECKPOINTS = 500;
const MAX_THREAD_PROPOSED_PLANS = 200;

function checkpointStatusToLatestTurnState(
  status: OrchestrationCheckpointStatus,
): "completed" | "interrupted" | "error" {
  if (status === "error") return "error";
  if (status === "missing") return "interrupted";
  return "completed";
}

function compareThreadActivities(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

// ── Pure state transition functions ────────────────────────────────────

export function syncServerReadModel(state: AppState, readModel: OrchestrationReadModel): AppState {
  const projects = mapProjectsFromReadModel(
    readModel.projects.filter((project) => project.deletedAt === null),
    state.projects,
  );
  const existingThreadById = new Map(state.threads.map((thread) => [thread.id, thread] as const));
  const threads = readModel.threads
    .filter((thread) => thread.deletedAt === null)
    .map((thread) => {
      const existing = existingThreadById.get(thread.id);
      const next: Thread = {
        id: thread.id,
        codexThreadId: null,
        projectId: thread.projectId,
        title: thread.title,
        modelSelection: {
          ...thread.modelSelection,
          model: resolveModelSlugForProvider(
            thread.modelSelection.provider,
            thread.modelSelection.model,
          ),
        },
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        session: thread.session
          ? {
              provider: toLegacyProvider(thread.session.providerName),
              status: toLegacySessionStatus(thread.session.status),
              orchestrationStatus: thread.session.status,
              activeTurnId: thread.session.activeTurnId ?? undefined,
              createdAt: thread.session.updatedAt,
              updatedAt: thread.session.updatedAt,
              ...(thread.session.lastError ? { lastError: thread.session.lastError } : {}),
            }
          : null,
        messages: thread.messages.map((message) => {
          const attachments = message.attachments?.map((attachment) => ({
            type: "image" as const,
            id: attachment.id,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            previewUrl: toAttachmentPreviewUrl(attachmentPreviewRoutePath(attachment.id)),
          }));
          const normalizedMessage: ChatMessage = {
            id: message.id,
            role: message.role,
            text: message.text,
            createdAt: message.createdAt,
            streaming: message.streaming,
            ...(message.streaming ? {} : { completedAt: message.updatedAt }),
            ...(attachments && attachments.length > 0 ? { attachments } : {}),
          };
          return normalizedMessage;
        }),
        proposedPlans: thread.proposedPlans.map((proposedPlan) => ({
          id: proposedPlan.id,
          turnId: proposedPlan.turnId,
          planMarkdown: proposedPlan.planMarkdown,
          implementedAt: proposedPlan.implementedAt,
          implementationThreadId: proposedPlan.implementationThreadId,
          createdAt: proposedPlan.createdAt,
          updatedAt: proposedPlan.updatedAt,
        })),
        error: thread.session?.lastError ?? null,
        createdAt: thread.createdAt,
        archivedAt: thread.archivedAt,
        updatedAt: thread.updatedAt,
        latestTurn: thread.latestTurn,
        lastVisitedAt: existing?.lastVisitedAt ?? thread.updatedAt,
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        turnDiffSummaries: thread.checkpoints.map((checkpoint) => ({
          turnId: checkpoint.turnId,
          completedAt: checkpoint.completedAt,
          status: checkpoint.status,
          assistantMessageId: checkpoint.assistantMessageId ?? undefined,
          checkpointTurnCount: checkpoint.checkpointTurnCount,
          checkpointRef: checkpoint.checkpointRef,
          files: checkpoint.files.map((file) => ({ ...file })),
        })),
        activities: thread.activities.map((activity) => ({ ...activity })),
      };
      if (existing && !threadChanged(existing, next)) {
        return existing;
      }
      return next;
    });

  const threadsUnchanged =
    threads.length === state.threads.length && threads.every((t, i) => t === state.threads[i]);
  const projectsUnchanged =
    projects.length === state.projects.length && projects.every((p, i) => p === state.projects[i]);

  if (threadsUnchanged && projectsUnchanged && state.threadsHydrated) {
    return state;
  }
  return {
    ...state,
    ...(projectsUnchanged ? {} : { projects }),
    ...(threadsUnchanged ? {} : { threads }),
    threadsHydrated: true,
  };
}

export function applyMessageSent(
  state: AppState,
  threadId: ThreadId,
  payload: {
    messageId: MessageId;
    role: "user" | "assistant" | "system";
    text: string;
    attachments?: Array<{
      type: "image";
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    turnId: TurnId | null;
    streaming: boolean;
    createdAt: string;
    updatedAt: string;
  },
): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const existingMessage = thread.messages.find((m) => m.id === payload.messageId);

    const attachments = payload.attachments?.map((attachment) => ({
      type: "image" as const,
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      previewUrl: toAttachmentPreviewUrl(attachmentPreviewRoutePath(attachment.id)),
    }));

    const messages = existingMessage
      ? thread.messages.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                text: payload.streaming
                  ? `${m.text}${payload.text}`
                  : payload.text.length > 0
                    ? payload.text
                    : m.text,
                streaming: payload.streaming,
                ...(payload.streaming ? {} : { completedAt: payload.updatedAt }),
                ...(attachments !== undefined ? { attachments } : {}),
              }
            : m,
        )
      : [
          ...thread.messages,
          {
            id: payload.messageId,
            role: payload.role,
            text: payload.text,
            createdAt: payload.createdAt,
            streaming: payload.streaming,
            ...(payload.streaming ? {} : { completedAt: payload.updatedAt }),
            ...(attachments && attachments.length > 0 ? { attachments } : {}),
          } satisfies ChatMessage,
        ];

    return {
      ...thread,
      messages:
        messages.length > MAX_THREAD_MESSAGES ? messages.slice(-MAX_THREAD_MESSAGES) : messages,
      updatedAt: payload.updatedAt,
    };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function applyActivityAppended(
  state: AppState,
  threadId: ThreadId,
  activity: OrchestrationThreadActivity,
  occurredAt: string,
): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const activities = [...thread.activities.filter((a) => a.id !== activity.id), activity]
      .toSorted(compareThreadActivities)
      .slice(-MAX_THREAD_ACTIVITIES);
    return { ...thread, activities, updatedAt: occurredAt };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function applySessionSet(
  state: AppState,
  threadId: ThreadId,
  session: OrchestrationSession,
  occurredAt: string,
): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const clientSession: ThreadSession = {
      provider: toLegacyProvider(session.providerName),
      status: toLegacySessionStatus(session.status),
      orchestrationStatus: session.status,
      activeTurnId: session.activeTurnId ?? undefined,
      createdAt: session.updatedAt,
      updatedAt: session.updatedAt,
      ...(session.lastError ? { lastError: session.lastError } : {}),
    };

    const latestTurn =
      session.status === "running" && session.activeTurnId !== null
        ? {
            turnId: session.activeTurnId,
            state: "running" as const,
            requestedAt:
              thread.latestTurn?.turnId === session.activeTurnId
                ? thread.latestTurn.requestedAt
                : session.updatedAt,
            startedAt:
              thread.latestTurn?.turnId === session.activeTurnId
                ? (thread.latestTurn.startedAt ?? session.updatedAt)
                : session.updatedAt,
            completedAt: null,
            assistantMessageId:
              thread.latestTurn?.turnId === session.activeTurnId
                ? thread.latestTurn.assistantMessageId
                : null,
          }
        : thread.latestTurn;

    return {
      ...thread,
      session: clientSession,
      latestTurn,
      error: session.lastError ?? null,
      updatedAt: occurredAt,
    };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function applyTurnDiffCompleted(
  state: AppState,
  threadId: ThreadId,
  payload: {
    turnId: TurnId;
    checkpointTurnCount: number;
    checkpointRef: CheckpointRef;
    status: OrchestrationCheckpointStatus;
    files: Array<{ path: string; kind: string; additions: number; deletions: number }>;
    assistantMessageId: MessageId | null;
    completedAt: string;
  },
  occurredAt: string,
): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const existing = thread.turnDiffSummaries.find((s) => s.turnId === payload.turnId);
    if (existing && existing.status !== "missing" && payload.status === "missing") {
      return thread;
    }

    const summary = {
      turnId: payload.turnId,
      completedAt: payload.completedAt,
      status: payload.status,
      assistantMessageId: payload.assistantMessageId ?? undefined,
      checkpointTurnCount: payload.checkpointTurnCount,
      checkpointRef: payload.checkpointRef,
      files: payload.files.map((f) => ({ ...f })),
    };

    const turnDiffSummaries = [
      ...thread.turnDiffSummaries.filter((s) => s.turnId !== payload.turnId),
      summary,
    ]
      .toSorted((a, b) => (a.checkpointTurnCount ?? 0) - (b.checkpointTurnCount ?? 0))
      .slice(-MAX_THREAD_CHECKPOINTS);

    const latestTurn = {
      turnId: payload.turnId,
      state: checkpointStatusToLatestTurnState(payload.status),
      requestedAt:
        thread.latestTurn?.turnId === payload.turnId
          ? thread.latestTurn.requestedAt
          : payload.completedAt,
      startedAt:
        thread.latestTurn?.turnId === payload.turnId
          ? (thread.latestTurn.startedAt ?? payload.completedAt)
          : payload.completedAt,
      completedAt: payload.completedAt,
      assistantMessageId: payload.assistantMessageId,
    };

    return { ...thread, turnDiffSummaries, latestTurn, updatedAt: occurredAt };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function applyProposedPlanUpserted(
  state: AppState,
  threadId: ThreadId,
  plan: OrchestrationProposedPlan,
  occurredAt: string,
): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const proposedPlans = [
      ...thread.proposedPlans.filter((p) => p.id !== plan.id),
      {
        id: plan.id,
        turnId: plan.turnId,
        planMarkdown: plan.planMarkdown,
        implementedAt: plan.implementedAt,
        implementationThreadId: plan.implementationThreadId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
    ]
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-MAX_THREAD_PROPOSED_PLANS);

    return { ...thread, proposedPlans, updatedAt: occurredAt };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function markThreadVisited(
  state: AppState,
  threadId: ThreadId,
  visitedAt?: string,
): AppState {
  const at = visitedAt ?? new Date().toISOString();
  const visitedAtMs = Date.parse(at);
  const threads = updateThread(state.threads, threadId, (thread) => {
    const previousVisitedAtMs = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : NaN;
    if (
      Number.isFinite(previousVisitedAtMs) &&
      Number.isFinite(visitedAtMs) &&
      previousVisitedAtMs >= visitedAtMs
    ) {
      return thread;
    }
    return { ...thread, lastVisitedAt: at };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function markThreadUnread(state: AppState, threadId: ThreadId): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    if (!thread.latestTurn?.completedAt) return thread;
    const latestTurnCompletedAtMs = Date.parse(thread.latestTurn.completedAt);
    if (Number.isNaN(latestTurnCompletedAtMs)) return thread;
    const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
    if (thread.lastVisitedAt === unreadVisitedAt) return thread;
    return { ...thread, lastVisitedAt: unreadVisitedAt };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function toggleProject(state: AppState, projectId: Project["id"]): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p)),
  };
}

export function setProjectExpanded(
  state: AppState,
  projectId: Project["id"],
  expanded: boolean,
): AppState {
  let changed = false;
  const projects = state.projects.map((p) => {
    if (p.id !== projectId || p.expanded === expanded) return p;
    changed = true;
    return { ...p, expanded };
  });
  return changed ? { ...state, projects } : state;
}

export function reorderProjects(
  state: AppState,
  draggedProjectId: Project["id"],
  targetProjectId: Project["id"],
): AppState {
  if (draggedProjectId === targetProjectId) return state;
  const draggedIndex = state.projects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = state.projects.findIndex((project) => project.id === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0) return state;
  const projects = [...state.projects];
  const [draggedProject] = projects.splice(draggedIndex, 1);
  if (!draggedProject) return state;
  projects.splice(targetIndex, 0, draggedProject);
  return { ...state, projects };
}

export function setError(state: AppState, threadId: ThreadId, error: string | null): AppState {
  const threads = updateThread(state.threads, threadId, (t) => {
    if (t.error === error) return t;
    return { ...t, error };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function setThreadBranch(
  state: AppState,
  threadId: ThreadId,
  branch: string | null,
  worktreePath: string | null,
): AppState {
  const threads = updateThread(state.threads, threadId, (t) => {
    if (t.branch === branch && t.worktreePath === worktreePath) return t;
    const cwdChanged = t.worktreePath !== worktreePath;
    return {
      ...t,
      branch,
      worktreePath,
      ...(cwdChanged ? { session: null } : {}),
    };
  });
  return threads === state.threads ? state : { ...state, threads };
}

// ── Zustand store ────────────────────────────────────────────────────

interface AppStore extends AppState {
  syncServerReadModel: (readModel: OrchestrationReadModel) => void;
  markThreadVisited: (threadId: ThreadId, visitedAt?: string) => void;
  markThreadUnread: (threadId: ThreadId) => void;
  toggleProject: (projectId: Project["id"]) => void;
  setProjectExpanded: (projectId: Project["id"], expanded: boolean) => void;
  reorderProjects: (draggedProjectId: Project["id"], targetProjectId: Project["id"]) => void;
  setError: (threadId: ThreadId, error: string | null) => void;
  setThreadBranch: (threadId: ThreadId, branch: string | null, worktreePath: string | null) => void;
  applyMessageSent: (threadId: ThreadId, payload: Parameters<typeof applyMessageSent>[2]) => void;
  applyActivityAppended: (
    threadId: ThreadId,
    activity: OrchestrationThreadActivity,
    occurredAt: string,
  ) => void;
  applySessionSet: (threadId: ThreadId, session: OrchestrationSession, occurredAt: string) => void;
  applyTurnDiffCompleted: (
    threadId: ThreadId,
    payload: Parameters<typeof applyTurnDiffCompleted>[2],
    occurredAt: string,
  ) => void;
  applyProposedPlanUpserted: (
    threadId: ThreadId,
    plan: OrchestrationProposedPlan,
    occurredAt: string,
  ) => void;
}

export const useStore = create<AppStore>((set) => ({
  ...readPersistedState(),
  syncServerReadModel: (readModel) => set((state) => syncServerReadModel(state, readModel)),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId) => set((state) => markThreadUnread(state, threadId)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  setProjectExpanded: (projectId, expanded) =>
    set((state) => setProjectExpanded(state, projectId, expanded)),
  reorderProjects: (draggedProjectId, targetProjectId) =>
    set((state) => reorderProjects(state, draggedProjectId, targetProjectId)),
  setError: (threadId, error) => set((state) => setError(state, threadId, error)),
  setThreadBranch: (threadId, branch, worktreePath) =>
    set((state) => setThreadBranch(state, threadId, branch, worktreePath)),
  applyMessageSent: (threadId, payload) =>
    set((state) => applyMessageSent(state, threadId, payload)),
  applyActivityAppended: (threadId, activity, occurredAt) =>
    set((state) => applyActivityAppended(state, threadId, activity, occurredAt)),
  applySessionSet: (threadId, session, occurredAt) =>
    set((state) => applySessionSet(state, threadId, session, occurredAt)),
  applyTurnDiffCompleted: (threadId, payload, occurredAt) =>
    set((state) => applyTurnDiffCompleted(state, threadId, payload, occurredAt)),
  applyProposedPlanUpserted: (threadId, plan, occurredAt) =>
    set((state) => applyProposedPlanUpserted(state, threadId, plan, occurredAt)),
}));

// Persist state changes with debouncing to avoid localStorage thrashing
useStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

// Flush pending writes synchronously before page unload to prevent data loss.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    persistState(useStore.getState());
  }, []);
  return createElement(Fragment, null, children);
}
