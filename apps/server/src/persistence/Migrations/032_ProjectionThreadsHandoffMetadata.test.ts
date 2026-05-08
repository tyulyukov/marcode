import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

/**
 * Regression-guard: a future merge from the upstream `pingdotgg/t3code` repo
 * MUST NOT silently drop migration 032. Mirrors the spirit of
 * `windowState.integration-guard.test.ts` and
 * `service.notification-wiring.test.ts`.
 *
 * Each test gets its own in-memory database layer because `it.layer` shares
 * the underlying connection across tests in a single block, and a re-run of
 * `runMigrations({toMigrationInclusive: 32})` is a no-op once the migration
 * tracking table records it.
 */

const freshDb = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

freshDb("032_ProjectionThreadsHandoffMetadata: schema", (it) => {
  it.effect("adds handoff + workspace association columns to projection_threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 32 });

      const threadCols = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const threadColNames = new Set(threadCols.map((row) => row.name));
      assert.isTrue(threadColNames.has("handoff_json"), "handoff_json column missing");
      assert.isTrue(
        threadColNames.has("associated_worktree_path"),
        "associated_worktree_path column missing",
      );
      assert.isTrue(
        threadColNames.has("associated_worktree_branch"),
        "associated_worktree_branch column missing",
      );
      assert.isTrue(
        threadColNames.has("associated_worktree_ref"),
        "associated_worktree_ref column missing",
      );
      assert.isTrue(
        threadColNames.has("create_branch_flow_completed"),
        "create_branch_flow_completed column missing",
      );

      const messageCols = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_thread_messages)
      `;
      const messageColNames = new Set(messageCols.map((row) => row.name));
      assert.isTrue(messageColNames.has("source"), "source column missing on messages");
    }),
  );
});

const backfillDb = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

backfillDb("032_ProjectionThreadsHandoffMetadata: backfill", (it) => {
  it.effect("backfills associated_worktree_path/branch from existing worktree_path/branch", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 31 });

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          archived_at,
          latest_user_message_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan,
          deleted_at
        )
        VALUES (
          'thread-with-worktree',
          'project-1',
          'WT thread',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'approval-required',
          'default',
          'feature/x',
          '/tmp/worktree-x',
          NULL,
          '2026-05-08T00:00:00.000Z',
          '2026-05-08T00:00:00.000Z',
          NULL,
          NULL,
          0,
          0,
          0,
          NULL
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 32 });

      const rows = yield* sql<{
        readonly associated_worktree_path: string | null;
        readonly associated_worktree_branch: string | null;
        readonly associated_worktree_ref: string | null;
        readonly create_branch_flow_completed: number;
      }>`
        SELECT
          associated_worktree_path,
          associated_worktree_branch,
          associated_worktree_ref,
          create_branch_flow_completed
        FROM projection_threads
        WHERE thread_id = 'thread-with-worktree'
      `;

      assert.strictEqual(rows.length, 1);
      const row = rows[0]!;
      assert.strictEqual(row.associated_worktree_path, "/tmp/worktree-x");
      assert.strictEqual(row.associated_worktree_branch, "feature/x");
      assert.strictEqual(row.associated_worktree_ref, "feature/x");
      assert.strictEqual(row.create_branch_flow_completed, 0);
    }),
  );
});

const messageSourceDb = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

messageSourceDb("032_ProjectionThreadsHandoffMetadata: message source", (it) => {
  it.effect("defaults message source to 'native' for existing rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 31 });

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          archived_at,
          latest_user_message_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan,
          deleted_at
        )
        VALUES (
          'thread-msg',
          'project-1',
          'msg thread',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'approval-required',
          'default',
          NULL,
          NULL,
          NULL,
          '2026-05-08T00:00:00.000Z',
          '2026-05-08T00:00:00.000Z',
          NULL,
          NULL,
          0,
          0,
          0,
          NULL
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_messages (
          thread_id,
          message_id,
          role,
          text,
          turn_id,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES (
          'thread-msg',
          'message-1',
          'user',
          'hello',
          NULL,
          0,
          '2026-05-08T00:00:00.000Z',
          '2026-05-08T00:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 32 });

      const rows = yield* sql<{ readonly source: string }>`
        SELECT source FROM projection_thread_messages WHERE message_id = 'message-1'
      `;
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0]!.source, "native");
    }),
  );
});
