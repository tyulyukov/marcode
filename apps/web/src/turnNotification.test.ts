import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ThreadId, ProjectId, OrchestrationEvent } from "@marcode/contracts";
import {
  BUILT_IN_SOUNDS,
  reasonToEventGroup,
  buildNotificationContent,
  deriveTurnNotificationTriggers,
  markThreadUserStopped,
} from "./turnNotification";
import type { Thread, Project } from "./types";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1" as ThreadId,
    title: "Test thread",
    projectId: "project-1" as ProjectId,
    session: { orchestrationStatus: "running" },
    ...overrides,
  } as Thread;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1" as ProjectId,
    name: "Test project",
    ...overrides,
  } as Project;
}

function makeSessionSetEvent(threadId: string, status: string): OrchestrationEvent {
  return {
    type: "thread.session-set",
    payload: {
      threadId: threadId as ThreadId,
      session: { status },
    },
  } as unknown as OrchestrationEvent;
}

function makeActivityAppendedEvent(threadId: string, kind: string): OrchestrationEvent {
  return {
    type: "thread.activity-appended",
    payload: {
      threadId: threadId as ThreadId,
      activity: { kind },
    },
  } as unknown as OrchestrationEvent;
}

describe("BUILT_IN_SOUNDS", () => {
  it("has 4 entries with valid id, label, and src", () => {
    expect(BUILT_IN_SOUNDS).toHaveLength(4);
    for (const sound of BUILT_IN_SOUNDS) {
      expect(sound.id).toBeTruthy();
      expect(sound.label).toBeTruthy();
      expect(sound.src).toMatch(/^\/sounds\/.+\.mp3$/);
    }
  });
});

describe("reasonToEventGroup", () => {
  it("maps turn-completed to turn-events", () => {
    expect(reasonToEventGroup("turn-completed")).toBe("turn-events");
  });

  it("maps approval-requested to approval-needed", () => {
    expect(reasonToEventGroup("approval-requested")).toBe("approval-needed");
  });
});

describe("buildNotificationContent", () => {
  it("formats title and body correctly", () => {
    const result = buildNotificationContent({
      threadId: "thread-1" as ThreadId,
      reason: "turn-completed",
      threadTitle: "My thread",
      projectName: "My project",
    });
    expect(result.title).toBe("Turn completed");
    expect(result.body).toBe('"My thread" \u2014 My project');
  });
});

describe("deriveTurnNotificationTriggers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits trigger for a completed turn", () => {
    const thread = makeThread();
    const project = makeProject();
    const events = [makeSessionSetEvent("thread-1", "idle")];

    const triggers = deriveTurnNotificationTriggers(
      events,
      () => thread,
      () => project,
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.reason).toBe("turn-completed");
    expect(triggers[0]!.threadTitle).toBe("Test thread");
    expect(triggers[0]!.projectName).toBe("Test project");
  });

  it("suppresses user-stopped threads", () => {
    const thread = makeThread();
    const project = makeProject();

    vi.spyOn(Date, "now").mockReturnValue(1000);
    markThreadUserStopped("thread-1" as ThreadId);

    vi.spyOn(Date, "now").mockReturnValue(2000);
    const events = [makeSessionSetEvent("thread-1", "idle")];

    const triggers = deriveTurnNotificationTriggers(
      events,
      () => thread,
      () => project,
    );

    expect(triggers).toHaveLength(0);
  });

  it("emits for approval-requested activity", () => {
    const thread = makeThread();
    const project = makeProject();
    const events = [makeActivityAppendedEvent("thread-1", "approval.requested")];

    const triggers = deriveTurnNotificationTriggers(
      events,
      () => thread,
      () => project,
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.reason).toBe("approval-requested");
  });

  it("markThreadUserStopped suppresses subsequent triggers within window", () => {
    const thread = makeThread({ id: "thread-2" as ThreadId });
    const project = makeProject();

    vi.spyOn(Date, "now").mockReturnValue(10000);
    markThreadUserStopped("thread-2" as ThreadId);

    vi.spyOn(Date, "now").mockReturnValue(13000);
    const eventsWithinWindow = [makeSessionSetEvent("thread-2", "ready")];

    const triggersWithin = deriveTurnNotificationTriggers(
      eventsWithinWindow,
      () => thread,
      () => project,
    );
    expect(triggersWithin).toHaveLength(0);

    vi.spyOn(Date, "now").mockReturnValue(16000);
    const eventsAfterWindow = [makeSessionSetEvent("thread-2", "idle")];

    const triggersAfter = deriveTurnNotificationTriggers(
      eventsAfterWindow,
      () => thread,
      () => project,
    );
    expect(triggersAfter).toHaveLength(1);
    expect(triggersAfter[0]!.reason).toBe("turn-completed");
  });
});
