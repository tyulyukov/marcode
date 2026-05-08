import { describe, expect, it } from "vitest";

import { hasAssociatedWorktree, resolveWorktreeHandoffIntent } from "./worktreeHandoff.ts";

describe("hasAssociatedWorktree", () => {
  it("returns false when nothing is set", () => {
    expect(hasAssociatedWorktree({})).toBe(false);
  });

  it("returns true if any associated field is non-null", () => {
    expect(hasAssociatedWorktree({ associatedWorktreePath: "/tmp/wt" })).toBe(true);
    expect(hasAssociatedWorktree({ associatedWorktreeBranch: "feature/x" })).toBe(true);
    expect(hasAssociatedWorktree({ associatedWorktreeRef: "abc123" })).toBe(true);
  });
});

describe("resolveWorktreeHandoffIntent", () => {
  it("returns null when neither preferred name nor associated worktree present", () => {
    expect(
      resolveWorktreeHandoffIntent({
        preferredWorktreeBaseBranch: "main",
        currentBranch: "feature/x",
      }),
    ).toBeNull();
  });

  it("returns create-new when a preferred worktree name is provided", () => {
    expect(
      resolveWorktreeHandoffIntent({
        preferredNewWorktreeName: "feat/y",
        preferredWorktreeBaseBranch: "main",
        currentBranch: "feature/x",
      }),
    ).toEqual({
      kind: "create-new",
      worktreeName: "feat/y",
      baseBranch: "main",
    });
  });

  it("trims whitespace from preferredNewWorktreeName", () => {
    const result = resolveWorktreeHandoffIntent({
      preferredNewWorktreeName: "  feat/y  ",
    });
    expect(result).toEqual({
      kind: "create-new",
      worktreeName: "feat/y",
      baseBranch: null,
    });
  });

  it("returns reuse-associated when only the associated worktree is set", () => {
    const result = resolveWorktreeHandoffIntent({
      associatedWorktreePath: "/tmp/wt",
      associatedWorktreeBranch: "feature/x",
      associatedWorktreeRef: "feature/x",
      currentBranch: "feature/x",
    });
    expect(result).toEqual({
      kind: "reuse-associated",
      associatedWorktreePath: "/tmp/wt",
      associatedWorktreeBranch: "feature/x",
      associatedWorktreeRef: "feature/x",
      baseBranch: "feature/x",
    });
  });

  it("prefers preferredNewWorktreeName over associated worktree (create-new wins)", () => {
    const result = resolveWorktreeHandoffIntent({
      preferredNewWorktreeName: "feat/y",
      associatedWorktreePath: "/tmp/old",
    });
    expect(result?.kind).toBe("create-new");
  });
});
