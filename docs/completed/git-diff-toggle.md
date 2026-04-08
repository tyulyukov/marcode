# Git Working Tree Diff Toggle

> Upstream references: [pingdotgg/t3code#1809](https://github.com/pingdotgg/t3code/pull/1809) by @D3OXY, [#1801](https://github.com/pingdotgg/t3code/pull/1801) by @itsfrank

## Summary

Add a toggle in the diff panel header that switches between two modes:

- **Session mode** (default) — existing checkpoint-based turn-by-turn diffs.
- **Git mode** — live `git diff HEAD` output showing all staged + unstaged changes on tracked files.

This provides visibility into changes made outside the agent (manual edits, IDE refactors, other tools) and serves as a reliability fallback when checkpoint diffs are incomplete.

## Why

- Users frequently combine agent work with manual edits in their IDE. The current diff panel only shows agent-driven checkpoint diffs, making manual changes invisible.
- When checkpoints are incomplete or unavailable, the diff panel shows nothing — git mode provides a reliable fallback.
- Two competing PRs implemented this feature — strong community demand.

## User Flow

1. Open the diff panel (sidebar).
2. See a `ToggleGroup` with two icons: a list icon (Session) and a git branch icon (Git).
3. **Session mode** (default): existing behavior — turn chips, checkpoint diffs, turn-by-turn navigation.
4. Click the git branch icon → **Git mode**: shows live `git diff HEAD` output across all tracked files.
5. Turn chip strip is replaced with a static "Working tree changes" label.
6. Clicking any turn chip or "View diff" on a message automatically switches back to Session mode.
7. Git diff auto-refreshes when `gitStatus` changes (no polling).

## Architecture

### Data Flow (Git Mode)

```
DiffPanel toggle → diffScope="git" (URL param via TanStack Router)
  │
  ▼
React Query: gitWorkingTreeDiffQueryOptions({ cwd, enabled: diffScope === "git" })
  │
  ▼
WebSocket RPC: git.workingTreeDiff({ cwd })
  │
  ▼
Server: GitCore.readWorkingTreeDiff(cwd)
  │ git diff HEAD --patch --minimal --no-color
  │ (or git diff --cached for repos with no commits yet)
  ▼
Response: { diff: string }  (unified patch, max 512KB)
  │
  ▼
Client: parsePatchFiles(diff) → FileDiff[] → same rendering pipeline as checkpoint diffs
```

### Contracts

```ts
// packages/contracts/src/git.ts
export const GitWorkingTreeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});

export const GitWorkingTreeDiffResult = Schema.Struct({
  diff: Schema.String,
});
```

### Server Implementation

```ts
// apps/server/src/git/Layers/GitCore.ts
const WORKING_TREE_DIFF_MAX_OUTPUT_BYTES = 512_000;

const readWorkingTreeDiff = Effect.fn("readWorkingTreeDiff")(function* (cwd) {
  const hasCommits = yield* executeGit(["rev-parse", "HEAD"], { allowNonZeroExit: true }).pipe(
    Effect.map((result) => result.code === 0),
  );

  if (hasCommits) {
    return yield* runGitStdoutWithOptions(
      cwd,
      ["diff", "HEAD", "--patch", "--minimal", "--no-color"],
      { maxOutputBytes: WORKING_TREE_DIFF_MAX_OUTPUT_BYTES, truncateOutputAtMaxBytes: true },
    );
  }
  // No commits yet — show staged changes only
  return yield* runGitStdoutWithOptions(
    cwd,
    ["diff", "--cached", "--patch", "--minimal", "--no-color"],
    { maxOutputBytes: WORKING_TREE_DIFF_MAX_OUTPUT_BYTES, truncateOutputAtMaxBytes: true },
  );
});
```

### WS Handler

```ts
// apps/server/src/ws.ts
[WS_METHODS.gitWorkingTreeDiff]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitWorkingTreeDiff,
    git.readWorkingTreeDiff(input.cwd).pipe(Effect.map((diff) => ({ diff }))),
    { "rpc.aggregate": "git" },
  ),
```

### Client React Query

```ts
// apps/web/src/lib/gitReactQuery.ts
export function gitWorkingTreeDiffQueryOptions(input: { cwd: string | null; enabled?: boolean }) {
  return queryOptions({
    queryKey: gitQueryKeys.workingTreeDiff(input.cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git working tree diff is unavailable.");
      return api.git.workingTreeDiff({ cwd: input.cwd });
    },
    enabled: input.cwd !== null && (input.enabled ?? true),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
```

### Toggle UI

```tsx
// apps/web/src/components/DiffPanel.tsx
<ToggleGroup
  variant="outline"
  size="xs"
  value={[diffScope]}
  onValueChange={(value) => {
    const next = value[0];
    if (next === "session" || next === "git") setDiffScope(next);
  }}
>
  <Toggle aria-label="Session turn diffs" title="Session turn diffs" value="session">
    <ListIcon className="size-3" />
  </Toggle>
  <Toggle aria-label="Git working tree diff" title="Git working tree diff" value="git">
    <GitBranchIcon className="size-3" />
  </Toggle>
</ToggleGroup>
```

### Scope Isolation

```ts
// Each query is gated by diffScope — only one runs at a time
activeCheckpointDiffQuery: enabled = isGitRepo && diffScope === "session";
gitDiffQuery: enabled = isGitRepo && diffScope === "git";

// Single derivation point
const selectedPatch = diffScope === "git" ? gitPatch : sessionPatch;
```

### Auto-Invalidation (No Polling)

```ts
// When git status changes, invalidate the working tree diff cache
useEffect(() => {
  if (diffScope === "git" && activeCwd) {
    queryClient.invalidateQueries({
      queryKey: gitQueryKeys.workingTreeDiff(activeCwd),
    });
  }
}, [gitStatusQuery.data]); // piggybacks on the existing git status subscription
```

### URL State

`diffScope` is stored as a URL search param via TanStack Router (`diffRouteSearch.ts`). Defaults to `undefined` (treated as `"session"`), so existing bookmarks are backward-compatible. The memoization cache key includes `:${diffScope}` to prevent cross-mode cache collisions.

## Edge Cases

| Case                                         | Handling                                                        |
| -------------------------------------------- | --------------------------------------------------------------- |
| Repo has no commits yet                      | Falls back to `git diff --cached` (staged changes only)         |
| Diff output exceeds 512KB                    | Truncated at `maxOutputBytes` — avoids OOM on massive diffs     |
| Not a git repo                               | Toggle disabled, `isGitRepo` gates the query `enabled` flag     |
| Clicking a turn chip while in git mode       | `selectTurn()` forces `diffScope: "session"`                    |
| Existing bookmarks / URL without `diffScope` | `undefined` defaults to `"session"` — fully backward-compatible |
| Git status changes while viewing git diff    | `useEffect` on `gitStatusQuery.data` invalidates the cache      |

## Implementation Notes for MarCode

- MarCode already has `GitCore` and the git status subscription infrastructure — this feature layers on top cleanly.
- The `readWorkingTreeDiff` method should be added to the `GitCoreShape` interface, and for GitLab support, the same `git diff HEAD` command works regardless of host provider.
- PR #1801 also adds collapsible file diff cards and expand/collapse all — consider adopting those QoL improvements alongside the toggle.
- The `staleTime: 0` + `refetchOnWindowFocus: true` combination ensures the git diff is always fresh when the user looks at it.
