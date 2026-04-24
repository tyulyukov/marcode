/**
 * Public Docs: https://cursor.com/docs/cli/acp#cursor-extension-methods
 * Additional reference provided by the Cursor team: https://anysphere.enterprise.slack.com/files/U068SSJE141/F0APT1HSZRP/cursor-acp-extension-method-schemas.md
 */
import type { UserInputQuestion } from "@marcode/contracts";
import { Schema } from "effect";

const CursorAskQuestionOption = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
});

const CursorAskQuestion = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(CursorAskQuestionOption),
  allowMultiple: Schema.optional(Schema.Boolean),
});

export const CursorAskQuestionRequest = Schema.Struct({
  toolCallId: Schema.String,
  title: Schema.optional(Schema.String),
  questions: Schema.Array(CursorAskQuestion),
});

const CursorTodoStatus = Schema.String;

const CursorTodo = Schema.Struct({
  id: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  status: Schema.optional(CursorTodoStatus),
});

const CursorPlanPhase = Schema.Struct({
  name: Schema.String,
  todos: Schema.Array(CursorTodo),
});

export const CursorCreatePlanRequest = Schema.Struct({
  toolCallId: Schema.String,
  name: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
  plan: Schema.String,
  todos: Schema.Array(CursorTodo),
  isProject: Schema.optional(Schema.Boolean),
  phases: Schema.optional(Schema.Array(CursorPlanPhase)),
});

export const CursorUpdateTodosRequest = Schema.Struct({
  toolCallId: Schema.String,
  todos: Schema.Array(CursorTodo),
  merge: Schema.Boolean,
});

// Cursor emits `cursor/task` as a fire-and-forget JSON-RPC notification once
// a subagent task completes — it's our only observable signal for subagent
// work (there's no paired `session/update` stream for it). We project it into
// both a `task.started` and a `task.completed` runtime event so the web
// timeline's subagent-task grouping logic can render the agent-group card.
export const CursorTaskNotification = Schema.Struct({
  toolCallId: Schema.String,
  description: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  subagentType: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  agentId: Schema.optional(Schema.String),
  durationMs: Schema.optional(Schema.Number),
});

export function extractAskQuestions(
  params: typeof CursorAskQuestionRequest.Type,
): ReadonlyArray<UserInputQuestion> {
  return params.questions.map((question) => ({
    id: question.id,
    header: "Question",
    question: question.prompt,
    multiSelect: question.allowMultiple === true,
    options:
      question.options.length > 0
        ? question.options.map((option) => ({
            label: option.label,
            description: option.label,
          }))
        : [{ label: "OK", description: "Continue" }],
  }));
}

export function extractPlanMarkdown(params: typeof CursorCreatePlanRequest.Type): string {
  return params.plan || "# Plan\n\n(Cursor did not supply plan text.)";
}

export function extractTodosAsPlan(params: typeof CursorUpdateTodosRequest.Type): {
  readonly explanation?: string;
  readonly plan: ReadonlyArray<{
    readonly step: string;
    readonly status: "pending" | "inProgress" | "completed";
  }>;
} {
  const plan = params.todos.flatMap((todo) => {
    const step = todo.content?.trim() ?? todo.title?.trim() ?? "";
    if (step === "") {
      return [];
    }
    const status: "pending" | "inProgress" | "completed" =
      todo.status === "completed"
        ? "completed"
        : todo.status === "in_progress" || todo.status === "inProgress"
          ? "inProgress"
          : "pending";
    return [{ step, status }];
  });
  return { plan };
}
