import { Effect, Schema } from "effect";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Struct } from "effect";
import { OrchestrationThreadShell, ModelSelection } from "@marcode/contracts";
import { ProjectionThread } from "./src/persistence/Services/ProjectionThreads.ts";

const sqlite = SqliteClient.layer({
  filename: "/Users/tyulyukov/.marcode/dev/state.sqlite",
  readonly: true,
});

const ProjectionThreadDbRowSchema = ProjectionThread.mapFields(
  Struct.assign({
    modelSelection: Schema.fromJsonString(ModelSelection),
    additionalDirectories: Schema.fromJsonString(Schema.Array(Schema.String)),
    implementingJiraTicketKeys: Schema.fromJsonString(Schema.Array(Schema.String)),
  }),
);

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listThreadRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadDbRowSchema,
    execute: () => sql`
      SELECT
        thread_id AS "threadId",
        project_id AS "projectId",
        title,
        model_selection_json AS "modelSelection",
        runtime_mode AS "runtimeMode",
        interaction_mode AS "interactionMode",
        branch,
        worktree_path AS "worktreePath",
        additional_directories_json AS "additionalDirectories",
        implementing_jira_ticket_keys_json AS "implementingJiraTicketKeys",
        latest_turn_id AS "latestTurnId",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt",
        latest_user_message_at AS "latestUserMessageAt",
        pending_approval_count AS "pendingApprovalCount",
        pending_user_input_count AS "pendingUserInputCount",
        has_actionable_proposed_plan AS "hasActionableProposedPlan",
        deleted_at AS "deletedAt"
      FROM projection_threads
      WHERE thread_id = ${"b6b12163-e9f1-473f-beae-ac9b63a34dcc"}
      ORDER BY created_at ASC, thread_id ASC
    `,
  });

  const rows = yield* listThreadRows();
  console.log("Number of rows:", rows.length);
  const r = rows[0];
  console.log("\nDecoded row .implementingJiraTicketKeys:", r.implementingJiraTicketKeys);
  console.log(
    "Type:",
    typeof r.implementingJiraTicketKeys,
    Array.isArray(r.implementingJiraTicketKeys),
  );

  // Build the candidate as snapshot does
  const candidate: any = {
    id: r.threadId,
    projectId: r.projectId,
    title: r.title,
    modelSelection: r.modelSelection,
    runtimeMode: r.runtimeMode,
    interactionMode: r.interactionMode,
    branch: r.branch,
    worktreePath: r.worktreePath,
    additionalDirectories: r.additionalDirectories,
    implementingJiraTicketKeys: r.implementingJiraTicketKeys as any,
    latestTurn: null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    archivedAt: r.archivedAt,
    session: null,
    latestUserMessageAt: r.latestUserMessageAt,
    hasPendingApprovals: r.pendingApprovalCount > 0,
    hasPendingUserInput: r.pendingUserInputCount > 0,
    hasActionableProposedPlan: r.hasActionableProposedPlan > 0,
  };
  console.log("\nCandidate .implementingJiraTicketKeys:", candidate.implementingJiraTicketKeys);

  // The snapshot uses Schema.Array(OrchestrationThreadShell) — let me check decoding via the SnapshotSchema
  const decoded = Schema.decodeUnknownSync(OrchestrationThreadShell)(candidate);
  console.log("\nDecoded shell .implementingJiraTicketKeys:", decoded.implementingJiraTicketKeys);

  // Wire encode + decode
  const encoded = Schema.encodeSync(OrchestrationThreadShell)(decoded);
  console.log(
    "\nEncoded for wire .implementingJiraTicketKeys:",
    (encoded as any).implementingJiraTicketKeys,
  );

  const wireJson = JSON.parse(JSON.stringify(encoded));
  const clientDecoded = Schema.decodeUnknownSync(OrchestrationThreadShell)(wireJson);
  console.log(
    "\nClient-decoded .implementingJiraTicketKeys:",
    clientDecoded.implementingJiraTicketKeys,
  );
});

await Effect.runPromise(program.pipe(Effect.provide(sqlite)));
