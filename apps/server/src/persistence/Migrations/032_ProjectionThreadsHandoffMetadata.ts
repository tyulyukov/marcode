import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Adds handoff- and workspace-association columns to `projection_threads`,
 * plus a `source` column to `projection_thread_messages` so the bootstrap
 * reactor and timeline can distinguish native turns from handoff-imported
 * copies.
 *
 * Idempotent: each ALTER is gated on a `pragma_table_info` probe so re-runs
 * (and partial failures) are safe.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const projectionThreadsColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const projectionThreadsHasColumn = (columnName: string) =>
    projectionThreadsColumns.some((column) => column.name === columnName);

  const projectionThreadMessagesColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `;
  const projectionThreadMessagesHasColumn = (columnName: string) =>
    projectionThreadMessagesColumns.some((column) => column.name === columnName);

  if (!projectionThreadsHasColumn("handoff_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN handoff_json TEXT
    `;
  }

  const addedAssociatedWorktreePath = !projectionThreadsHasColumn("associated_worktree_path");
  if (addedAssociatedWorktreePath) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN associated_worktree_path TEXT
    `;
  }

  const addedAssociatedWorktreeBranch = !projectionThreadsHasColumn("associated_worktree_branch");
  if (addedAssociatedWorktreeBranch) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN associated_worktree_branch TEXT
    `;
  }

  const addedAssociatedWorktreeRef = !projectionThreadsHasColumn("associated_worktree_ref");
  if (addedAssociatedWorktreeRef) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN associated_worktree_ref TEXT
    `;
  }

  // Backfill the association columns from the live `branch` / `worktree_path`
  // values for any thread that does not yet have an association recorded. We
  // run these AFTER all ALTERs so SQLite's transaction-time schema visibility
  // does not bite us.
  if (addedAssociatedWorktreePath) {
    yield* sql`
      UPDATE projection_threads
      SET associated_worktree_path = worktree_path
      WHERE associated_worktree_path IS NULL
    `;
  }
  if (addedAssociatedWorktreeBranch) {
    yield* sql`
      UPDATE projection_threads
      SET associated_worktree_branch = branch
      WHERE associated_worktree_branch IS NULL
    `;
  }
  if (addedAssociatedWorktreeRef) {
    yield* sql`
      UPDATE projection_threads
      SET associated_worktree_ref = COALESCE(associated_worktree_branch, branch)
      WHERE associated_worktree_ref IS NULL
        AND COALESCE(associated_worktree_branch, branch) IS NOT NULL
    `;
  }

  if (!projectionThreadsHasColumn("create_branch_flow_completed")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN create_branch_flow_completed INTEGER NOT NULL DEFAULT 0
    `;
  }

  if (!projectionThreadMessagesHasColumn("source")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      ADD COLUMN source TEXT NOT NULL DEFAULT 'native'
    `;
  }
});
