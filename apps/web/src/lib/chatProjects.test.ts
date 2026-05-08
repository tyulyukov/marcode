import { describe, expect, it } from "vitest";

import type { Project } from "../types";
import { isChatProject } from "./chatProjects";

const baseProject: Pick<Project, "kind"> = { kind: "project" };

describe("isChatProject", () => {
  it("returns true for chat-kind projects", () => {
    expect(isChatProject({ kind: "chat" })).toBe(true);
  });

  it("returns false for regular projects", () => {
    expect(isChatProject(baseProject)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isChatProject(null)).toBe(false);
    expect(isChatProject(undefined)).toBe(false);
  });
});
