import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_projects_created_at_id
    ON projection_projects(created_at ASC, project_id ASC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_created_at_id
    ON projection_threads(created_at ASC, thread_id ASC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created_id
    ON projection_thread_messages(thread_id ASC, created_at ASC, message_id ASC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_proposed_plans_thread_created_id
    ON projection_thread_proposed_plans(thread_id ASC, created_at ASC, plan_id ASC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_thread_id
    ON projection_thread_sessions(thread_id ASC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_requested_turn
    ON projection_turns(thread_id ASC, requested_at DESC, turn_id DESC)
  `;
});
