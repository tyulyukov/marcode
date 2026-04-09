import type {
  NotificationEventGroup,
  OrchestrationEvent,
  OrchestrationSessionStatus,
  ProjectId,
  ThreadId,
} from "@marcode/contracts";
import type { Project, Thread } from "./types";

export type TurnNotificationReason =
  | "turn-completed"
  | "turn-interrupted"
  | "turn-stopped"
  | "turn-errored"
  | "approval-requested"
  | "user-input-requested";

export interface TurnNotificationTrigger {
  threadId: ThreadId;
  reason: TurnNotificationReason;
  threadTitle: string;
  projectName: string;
}

export interface BuiltInSound {
  readonly id: string;
  readonly label: string;
  readonly src: string;
}

export const BUILT_IN_SOUNDS: readonly BuiltInSound[] = [
  { id: "gentle-chime", label: "Gentle chime", src: "/sounds/gentle-chime.mp3" },
  { id: "pop", label: "Pop", src: "/sounds/pop.mp3" },
  { id: "bell", label: "Bell", src: "/sounds/bell.mp3" },
  { id: "success", label: "Success", src: "/sounds/success.mp3" },
] as const;

const COMPLETION_STATUS_TO_REASON: Partial<
  Record<OrchestrationSessionStatus, TurnNotificationReason>
> = {
  idle: "turn-completed",
  ready: "turn-completed",
  interrupted: "turn-interrupted",
  stopped: "turn-stopped",
  error: "turn-errored",
};

export function deriveTurnNotificationTriggers(
  events: readonly OrchestrationEvent[],
  getThread: (threadId: ThreadId) => Thread | undefined,
  getProject: (projectId: ProjectId) => Project | undefined,
): TurnNotificationTrigger[] {
  const triggers: TurnNotificationTrigger[] = [];

  for (const event of events) {
    if (event.type === "thread.session-set") {
      const { threadId, session } = event.payload;
      const newStatus = session.status;

      const reason = COMPLETION_STATUS_TO_REASON[newStatus];
      if (!reason) continue;

      const thread = getThread(threadId);
      if (!thread) continue;
      if (thread.session?.orchestrationStatus !== "running") continue;

      const project = getProject(thread.projectId);
      triggers.push({
        threadId,
        reason,
        threadTitle: thread.title || "Untitled",
        projectName: project?.name || "Unknown project",
      });
      continue;
    }

    if (event.type === "thread.activity-appended") {
      const { threadId, activity } = event.payload;
      const kind = activity.kind;

      let reason: TurnNotificationReason | undefined;
      if (kind === "approval.requested") {
        reason = "approval-requested";
      } else if (kind === "user-input.requested") {
        reason = "user-input-requested";
      }
      if (!reason) continue;

      const thread = getThread(threadId);
      if (!thread) continue;
      const project = getProject(thread.projectId);
      triggers.push({
        threadId,
        reason,
        threadTitle: thread.title || "Untitled",
        projectName: project?.name || "Unknown project",
      });
    }
  }

  return triggers;
}

const REASON_TITLES: Record<TurnNotificationReason, string> = {
  "turn-completed": "Turn completed",
  "turn-interrupted": "Turn interrupted",
  "turn-stopped": "Turn stopped",
  "turn-errored": "Turn failed",
  "approval-requested": "Approval needed",
  "user-input-requested": "Input needed",
};

const REASON_TO_EVENT_GROUP: Record<TurnNotificationReason, NotificationEventGroup> = {
  "turn-completed": "turn-events",
  "turn-interrupted": "turn-events",
  "turn-stopped": "turn-events",
  "turn-errored": "turn-events",
  "approval-requested": "approval-needed",
  "user-input-requested": "user-input-needed",
};

export function reasonToEventGroup(reason: TurnNotificationReason): NotificationEventGroup {
  return REASON_TO_EVENT_GROUP[reason];
}

export function buildNotificationContent(trigger: TurnNotificationTrigger): {
  title: string;
  body: string;
} {
  return {
    title: REASON_TITLES[trigger.reason],
    body: `"${trigger.threadTitle}" \u2014 ${trigger.projectName}`,
  };
}
