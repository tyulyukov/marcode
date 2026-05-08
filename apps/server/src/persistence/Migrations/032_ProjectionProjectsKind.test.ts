import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("032_ProjectionProjectsKind", (it) => {
  it.effect("adds the kind column with a 'project' default", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 31 });

      // Pre-existing rows (no kind column yet) should backfill to 'project'.
      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          default_model_selection_json,
          scripts_json,
          jira_board_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          'p-legacy',
          'Legacy project',
          '/tmp/legacy',
          NULL,
          '[]',
          NULL,
          '2026-04-13T00:00:00.000Z',
          '2026-04-13T00:00:00.000Z',
          NULL
        )
      `;

      yield* runMigrations();

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_projects)
      `;
      assert.isTrue(
        columns.some((column) => column.name === "kind"),
        "kind column should exist after migration",
      );

      const rows = yield* sql<{ readonly kind: string | null }>`
        SELECT kind FROM projection_projects WHERE project_id = 'p-legacy'
      `;
      assert.deepEqual(
        rows.map((row) => row.kind),
        ["project"],
        "legacy rows should default to kind='project'",
      );
    }),
  );

  it.effect("preserves explicit kind values written after the migration", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          kind,
          default_model_selection_json,
          scripts_json,
          jira_board_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          'p-chat',
          'Scratchpad',
          '/Users/me/.marcode/chats/p-chat',
          'chat',
          NULL,
          '[]',
          NULL,
          '2026-04-13T00:00:00.000Z',
          '2026-04-13T00:00:00.000Z',
          NULL
        )
      `;

      const rows = yield* sql<{ readonly kind: string | null }>`
        SELECT kind FROM projection_projects WHERE project_id = 'p-chat'
      `;
      assert.deepEqual(
        rows.map((row) => row.kind),
        ["chat"],
      );
    }),
  );
});
