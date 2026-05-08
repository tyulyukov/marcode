import { CommandId, ProjectId, type OrchestrationCommand } from "@marcode/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel } from "./projector.ts";

const asCommandId = (value: string): CommandId => CommandId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);

const buildCreateChatCommand = (overrides: {
  projectId?: ProjectId;
  workspaceRoot?: string;
}): Extract<OrchestrationCommand, { type: "project.create" }> => {
  const projectId = overrides.projectId ?? asProjectId("project-chat");
  return {
    type: "project.create",
    commandId: asCommandId("cmd-create-chat"),
    projectId,
    title: "Scratchpad",
    kind: "chat",
    workspaceRoot: overrides.workspaceRoot ?? "/Users/me/.marcode/chats/project-chat",
    createWorkspaceRootIfMissing: true,
    createdAt: new Date().toISOString(),
  };
};

describe("decideOrchestrationCommand: project.create with kind='chat'", () => {
  it("emits a project.created event with kind='chat'", async () => {
    const now = new Date().toISOString();
    const readModel = createEmptyReadModel(now);
    const command = buildCreateChatCommand({});

    const result = await Effect.runPromise(decideOrchestrationCommand({ command, readModel }));

    const events = Array.isArray(result) ? result : [result];
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.type).toBe("project.created");
    if (event.type !== "project.created") return; // narrow
    expect(event.payload.kind).toBe("chat");
    expect(event.payload.workspaceRoot).toBe("/Users/me/.marcode/chats/project-chat");
    expect(event.payload.projectId).toBe(command.projectId);
  });

  it("defaults kind to 'project' when omitted", async () => {
    const now = new Date().toISOString();
    const readModel = createEmptyReadModel(now);
    const command: Extract<OrchestrationCommand, { type: "project.create" }> = {
      type: "project.create",
      commandId: asCommandId("cmd-create-regular"),
      projectId: asProjectId("project-regular"),
      title: "Regular",
      workspaceRoot: "/tmp/regular",
      createWorkspaceRootIfMissing: false,
      createdAt: now,
    };

    const result = await Effect.runPromise(decideOrchestrationCommand({ command, readModel }));

    const events = Array.isArray(result) ? result : [result];
    const [event] = events;
    expect(event.type).toBe("project.created");
    if (event.type !== "project.created") return;
    expect(event.payload.kind).toBe("project");
  });
});
