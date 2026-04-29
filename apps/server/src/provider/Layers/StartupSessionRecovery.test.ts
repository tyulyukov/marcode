import {
  type OrchestrationCommand,
  type OrchestrationReadModel,
  ProjectId,
  ThreadId,
  TurnId,
} from "@marcode/contracts";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../../orchestration/Services/OrchestrationEngine.ts";
import { recoverOrphanedProviderSessionsAtStartup } from "./StartupSessionRecovery.ts";

const defaultModelSelection = {
  provider: "claudeAgent",
  model: "claude-opus-4-7",
} as const;

type SessionStatus = "starting" | "running" | "ready" | "interrupted" | "stopped" | "error";

function makeReadModel(
  threads: ReadonlyArray<{
    readonly id: ThreadId;
    readonly session: {
      readonly threadId: ThreadId;
      readonly status: SessionStatus;
      readonly providerName: "codex" | "claudeAgent";
      readonly runtimeMode: "approval-required" | "full-access" | "auto-accept-edits";
      readonly activeTurnId: TurnId | null;
      readonly lastError: string | null;
      readonly compacting: boolean;
      readonly updatedAt: string;
    } | null;
  }>,
): OrchestrationReadModel {
  const now = new Date().toISOString();
  const projectId = ProjectId.make("project-startup-recovery");

  return {
    snapshotSequence: 0,
    updatedAt: now,
    projects: [
      {
        id: projectId,
        title: "Startup Recovery Project",
        workspaceRoot: "/tmp/startup-recovery-project",
        defaultModelSelection,
        scripts: [],
        jiraBoard: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    threads: threads.map((thread) => ({
      id: thread.id,
      projectId,
      title: `Thread ${thread.id}`,
      modelSelection: defaultModelSelection,
      interactionMode: "default" as const,
      runtimeMode: "full-access" as const,
      branch: null,
      worktreePath: null,
      additionalDirectories: [],
      implementingJiraTicketKeys: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      latestTurn: null,
      messages: [],
      session: thread.session,
      activities: [],
      proposedPlans: [],
      checkpoints: [],
      deletedAt: null,
    })),
  } satisfies OrchestrationReadModel;
}

async function runRecoveryWith(readModel: OrchestrationReadModel) {
  const dispatched: Array<OrchestrationCommand> = [];
  const orchestrationEngine: OrchestrationEngineShape = {
    getReadModel: () => Effect.succeed(readModel),
    readEvents: () => Stream.empty,
    dispatch: (command) =>
      Effect.sync(() => {
        dispatched.push(command);
        return { sequence: dispatched.length };
      }),
    streamDomainEvents: Stream.empty,
  };

  const runtime = ManagedRuntime.make(
    Layer.succeed(OrchestrationEngineService, orchestrationEngine),
  );
  try {
    await runtime.runPromise(recoverOrphanedProviderSessionsAtStartup);
  } finally {
    await runtime.dispose();
  }
  return dispatched;
}

describe("recoverOrphanedProviderSessionsAtStartup", () => {
  it("interrupts threads stuck in running with stale active turn", async () => {
    const threadId = ThreadId.make("thread-startup-recovery-running");
    const turnId = TurnId.make("turn-startup-recovery");
    const now = new Date().toISOString();

    const dispatched = await runRecoveryWith(
      makeReadModel([
        {
          id: threadId,
          session: {
            threadId,
            status: "running",
            providerName: "claudeAgent",
            runtimeMode: "full-access",
            activeTurnId: turnId,
            lastError: null,
            compacting: true,
            updatedAt: now,
          },
        },
      ]),
    );

    expect(dispatched).toHaveLength(1);
    const command = dispatched[0];
    expect(command?.type).toBe("thread.session.set");
    if (command?.type !== "thread.session.set") return;
    expect(command.threadId).toBe(threadId);
    expect(command.session.status).toBe("interrupted");
    expect(command.session.activeTurnId).toBeNull();
    expect(command.session.compacting).toBe(false);
    expect(command.session.providerName).toBe("claudeAgent");
    expect(command.session.runtimeMode).toBe("full-access");
    expect(command.session.lastError).toMatch(/server restarted/i);
  });

  it("interrupts threads stuck in starting", async () => {
    const threadId = ThreadId.make("thread-startup-recovery-starting");
    const now = new Date().toISOString();

    const dispatched = await runRecoveryWith(
      makeReadModel([
        {
          id: threadId,
          session: {
            threadId,
            status: "starting",
            providerName: "claudeAgent",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            compacting: false,
            updatedAt: now,
          },
        },
      ]),
    );

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe("thread.session.set");
    if (dispatched[0]?.type !== "thread.session.set") return;
    expect(dispatched[0].session.status).toBe("interrupted");
  });

  it("ignores threads in terminal or non-running statuses", async () => {
    const now = new Date().toISOString();

    const dispatched = await runRecoveryWith(
      makeReadModel(
        (["ready", "interrupted", "stopped", "error", "idle"] as const).map((status, index) => ({
          id: ThreadId.make(`thread-startup-recovery-${status}`),
          session: {
            threadId: ThreadId.make(`thread-startup-recovery-${status}`),
            status: status as SessionStatus,
            providerName: "claudeAgent" as const,
            runtimeMode: "full-access" as const,
            activeTurnId: null,
            lastError: null,
            compacting: false,
            updatedAt: new Date(Date.parse(now) + index).toISOString(),
          },
        })),
      ),
    );

    expect(dispatched).toHaveLength(0);
  });

  it("ignores threads with no session", async () => {
    const dispatched = await runRecoveryWith(
      makeReadModel([
        {
          id: ThreadId.make("thread-startup-recovery-no-session"),
          session: null,
        },
      ]),
    );

    expect(dispatched).toHaveLength(0);
  });

  it("emits one recovery command per stuck thread", async () => {
    const now = new Date().toISOString();
    const ids = ["a", "b", "c"].map((suffix) =>
      ThreadId.make(`thread-startup-recovery-multi-${suffix}`),
    );

    const dispatched = await runRecoveryWith(
      makeReadModel(
        ids.map((threadId) => ({
          id: threadId,
          session: {
            threadId,
            status: "running" as const,
            providerName: "claudeAgent" as const,
            runtimeMode: "full-access" as const,
            activeTurnId: null,
            lastError: null,
            compacting: false,
            updatedAt: now,
          },
        })),
      ),
    );

    expect(dispatched).toHaveLength(3);
    const sessionCommands = dispatched.flatMap((command) =>
      command.type === "thread.session.set" ? [command] : [],
    );
    expect(sessionCommands).toHaveLength(3);
    expect(new Set(sessionCommands.map((command) => command.threadId))).toEqual(new Set(ids));
    const commandIds = sessionCommands.map((command) => command.commandId);
    expect(new Set(commandIds).size).toBe(commandIds.length);
    for (const commandId of commandIds) {
      expect(commandId).toMatch(/^server:startup-orphan-recovery:/);
    }
  });

  it("continues recovery for remaining threads after a dispatch failure", async () => {
    const now = new Date().toISOString();
    const failingThreadId = ThreadId.make("thread-startup-recovery-failing");
    const survivingThreadId = ThreadId.make("thread-startup-recovery-surviving");
    const dispatched: Array<OrchestrationCommand> = [];

    const orchestrationEngine: OrchestrationEngineShape = {
      getReadModel: () =>
        Effect.succeed(
          makeReadModel([
            {
              id: failingThreadId,
              session: {
                threadId: failingThreadId,
                status: "running",
                providerName: "claudeAgent",
                runtimeMode: "full-access",
                activeTurnId: null,
                lastError: null,
                compacting: false,
                updatedAt: now,
              },
            },
            {
              id: survivingThreadId,
              session: {
                threadId: survivingThreadId,
                status: "running",
                providerName: "claudeAgent",
                runtimeMode: "full-access",
                activeTurnId: null,
                lastError: null,
                compacting: false,
                updatedAt: now,
              },
            },
          ]),
        ),
      readEvents: () => Stream.empty,
      dispatch: (command) =>
        command.type === "thread.session.set" && command.threadId === failingThreadId
          ? Effect.die(new Error("simulated dispatch failure"))
          : Effect.sync(() => {
              dispatched.push(command);
              return { sequence: dispatched.length };
            }),
      streamDomainEvents: Stream.empty,
    };

    const runtime = ManagedRuntime.make(
      Layer.succeed(OrchestrationEngineService, orchestrationEngine),
    );
    try {
      await runtime.runPromise(recoverOrphanedProviderSessionsAtStartup);
    } finally {
      await runtime.dispose();
    }

    expect(dispatched).toHaveLength(1);
    const command = dispatched[0];
    expect(command?.type).toBe("thread.session.set");
    if (command?.type !== "thread.session.set") return;
    expect(command.threadId).toBe(survivingThreadId);
  });

  it("uses unique recovery command ids across invocations", async () => {
    const now = new Date().toISOString();
    const threadId = ThreadId.make("thread-startup-recovery-idempotent");
    const readModel = makeReadModel([
      {
        id: threadId,
        session: {
          threadId,
          status: "running",
          providerName: "claudeAgent",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          compacting: false,
          updatedAt: now,
        },
      },
    ]);

    const first = await runRecoveryWith(readModel);
    const second = await runRecoveryWith(readModel);

    expect(first[0]?.commandId).not.toBe(second[0]?.commandId);
  });
});
