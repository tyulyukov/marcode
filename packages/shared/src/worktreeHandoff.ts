export type WorktreeHandoffIntent =
  | {
      readonly kind: "create-new";
      readonly worktreeName: string;
      readonly baseBranch: string | null;
    }
  | {
      readonly kind: "reuse-associated";
      readonly associatedWorktreePath: string | null;
      readonly associatedWorktreeBranch: string | null;
      readonly associatedWorktreeRef: string | null;
      readonly baseBranch: string | null;
    };

export function hasAssociatedWorktree(input: {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): boolean {
  return Boolean(
    input.associatedWorktreePath ?? input.associatedWorktreeBranch ?? input.associatedWorktreeRef,
  );
}

export function resolveWorktreeHandoffIntent(input: {
  preferredNewWorktreeName?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  preferredWorktreeBaseBranch?: string | null;
  currentBranch?: string | null;
}): WorktreeHandoffIntent | null {
  const normalizedWorktreeName = input.preferredNewWorktreeName?.trim() ?? "";
  const baseBranch = input.preferredWorktreeBaseBranch ?? input.currentBranch ?? null;

  if (normalizedWorktreeName.length > 0) {
    return {
      kind: "create-new",
      worktreeName: normalizedWorktreeName,
      baseBranch,
    };
  }

  if (!hasAssociatedWorktree(input)) {
    return null;
  }

  return {
    kind: "reuse-associated",
    associatedWorktreePath: input.associatedWorktreePath ?? null,
    associatedWorktreeBranch: input.associatedWorktreeBranch ?? null,
    associatedWorktreeRef: input.associatedWorktreeRef ?? null,
    baseBranch,
  };
}
