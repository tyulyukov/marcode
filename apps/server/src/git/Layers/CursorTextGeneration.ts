import { Effect, Layer, Option, Ref, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { CursorModelSelection } from "@marcode/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@marcode/shared/git";

import { TextGenerationError } from "@marcode/contracts";
import {
  type ThreadTitleGenerationResult,
  type TextGenerationShape,
  TextGeneration,
} from "../Services/TextGeneration.ts";
import {
  buildBranchNamePrompt,
  buildClassifyImplementingJiraTicketsPrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "../Prompts.ts";
import {
  extractJsonObject,
  filterToAllowedKeys,
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "../Utils.ts";
import {
  applyCursorAcpModelSelection,
  makeCursorAcpRuntime,
} from "../../provider/acp/CursorAcpSupport.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const CURSOR_TIMEOUT_MS = 180_000;

function mapCursorAcpError(
  operation:
    | "generateCommitMessage"
    | "generatePrContent"
    | "generateBranchName"
    | "generateThreadTitle"
    | "classifyImplementingJiraTickets",
  detail: string,
  cause: unknown,
): TextGenerationError {
  return new TextGenerationError({
    operation,
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function isTextGenerationError(error: unknown): error is TextGenerationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "TextGenerationError"
  );
}

const makeCursorTextGeneration = Effect.gen(function* () {
  const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const serverSettingsService = yield* Effect.service(ServerSettingsService);

  const runCursorJson = <S extends Schema.Top>({
    operation,
    cwd,
    prompt,
    outputSchemaJson,
    modelSelection,
  }: {
    operation:
      | "generateCommitMessage"
      | "generatePrContent"
      | "generateBranchName"
      | "generateThreadTitle"
      | "classifyImplementingJiraTickets";
    cwd: string;
    prompt: string;
    outputSchemaJson: S;
    modelSelection: CursorModelSelection;
  }): Effect.Effect<S["Type"], TextGenerationError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const cursorSettings = yield* Effect.map(
        serverSettingsService.getSettings,
        (settings) => settings.providers.cursor,
      ).pipe(Effect.catch(() => Effect.undefined));

      const outputRef = yield* Ref.make("");
      const runtime = yield* makeCursorAcpRuntime({
        cursorSettings,
        childProcessSpawner: commandSpawner,
        cwd,
        clientInfo: { name: "t3-code-git-text", version: "0.0.0" },
      });

      yield* runtime.handleSessionUpdate((notification) => {
        const update = notification.update;
        if (update.sessionUpdate !== "agent_message_chunk") {
          return Effect.void;
        }
        const content = update.content;
        if (content.type !== "text") {
          return Effect.void;
        }
        return Ref.update(outputRef, (current) => current + content.text);
      });

      const promptResult = yield* Effect.gen(function* () {
        yield* runtime.start();
        yield* Effect.ignore(runtime.setMode("ask"));
        yield* applyCursorAcpModelSelection({
          runtime,
          model: modelSelection.model,
          selections: modelSelection.options,
          mapError: ({ cause, configId, step }) =>
            mapCursorAcpError(
              operation,
              step === "set-config-option"
                ? `Failed to set Cursor ACP config option "${configId}" for text generation.`
                : "Failed to set Cursor ACP base model for text generation.",
              cause,
            ),
        });

        return yield* runtime.prompt({
          prompt: [{ type: "text", text: prompt }],
        });
      }).pipe(
        Effect.timeoutOption(CURSOR_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new TextGenerationError({
                  operation,
                  detail: "Cursor Agent request timed out.",
                }),
              ),
            onSome: (value) => Effect.succeed(value),
          }),
        ),
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : mapCursorAcpError(operation, "Cursor ACP request failed.", cause),
        ),
      );

      const rawResult = (yield* Ref.get(outputRef)).trim();
      if (!rawResult) {
        return yield* new TextGenerationError({
          operation,
          detail:
            promptResult.stopReason === "cancelled"
              ? "Cursor ACP request was cancelled."
              : "Cursor Agent returned empty output.",
        });
      }

      return yield* Schema.decodeEffect(Schema.fromJsonString(outputSchemaJson))(
        extractJsonObject(rawResult),
      ).pipe(
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            new TextGenerationError({
              operation,
              detail: "Cursor Agent returned invalid structured output.",
              cause,
            }),
          ),
        ),
      );
    }).pipe(
      Effect.mapError((cause) =>
        isTextGenerationError(cause)
          ? cause
          : mapCursorAcpError(operation, "Cursor ACP text generation failed.", cause),
      ),
      Effect.scoped,
    );

  const generateCommitMessage: TextGenerationShape["generateCommitMessage"] = Effect.fn(
    "CursorTextGeneration.generateCommitMessage",
  )(function* (input) {
    const { prompt, outputSchema } = buildCommitMessagePrompt({
      branch: input.branch,
      stagedSummary: input.stagedSummary,
      stagedPatch: input.stagedPatch,
      includeBranch: input.includeBranch === true,
      ...(input.jiraTickets ? { jiraTickets: input.jiraTickets } : {}),
    });

    if (input.modelSelection.provider !== "cursor") {
      return yield* new TextGenerationError({
        operation: "generateCommitMessage",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* runCursorJson({
      operation: "generateCommitMessage",
      cwd: input.cwd,
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      subject: sanitizeCommitSubject(generated.subject),
      body: generated.body.trim(),
      ...("branch" in generated && typeof generated.branch === "string"
        ? { branch: sanitizeFeatureBranchName(generated.branch) }
        : {}),
    };
  });

  const generatePrContent: TextGenerationShape["generatePrContent"] = Effect.fn(
    "CursorTextGeneration.generatePrContent",
  )(function* (input) {
    const { prompt, outputSchema } = buildPrContentPrompt({
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commitSummary: input.commitSummary,
      diffSummary: input.diffSummary,
      diffPatch: input.diffPatch,
      ...(input.jiraTickets ? { jiraTickets: input.jiraTickets } : {}),
    });

    if (input.modelSelection.provider !== "cursor") {
      return yield* new TextGenerationError({
        operation: "generatePrContent",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* runCursorJson({
      operation: "generatePrContent",
      cwd: input.cwd,
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      title: sanitizePrTitle(generated.title),
      body: generated.body.trim(),
    };
  });

  const generateBranchName: TextGenerationShape["generateBranchName"] = Effect.fn(
    "CursorTextGeneration.generateBranchName",
  )(function* (input) {
    const { prompt, outputSchema } = buildBranchNamePrompt({
      message: input.message,
      attachments: input.attachments,
      ...(input.jiraTickets ? { jiraTickets: input.jiraTickets } : {}),
    });

    if (input.modelSelection.provider !== "cursor") {
      return yield* new TextGenerationError({
        operation: "generateBranchName",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* runCursorJson({
      operation: "generateBranchName",
      cwd: input.cwd,
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      branch: sanitizeBranchFragment(generated.branch),
    };
  });

  const generateThreadTitle: TextGenerationShape["generateThreadTitle"] = Effect.fn(
    "CursorTextGeneration.generateThreadTitle",
  )(function* (input) {
    const { prompt, outputSchema } = buildThreadTitlePrompt({
      message: input.message,
      attachments: input.attachments,
      ...(input.jiraTickets ? { jiraTickets: input.jiraTickets } : {}),
    });

    if (input.modelSelection.provider !== "cursor") {
      return yield* new TextGenerationError({
        operation: "generateThreadTitle",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* runCursorJson({
      operation: "generateThreadTitle",
      cwd: input.cwd,
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      title: sanitizeThreadTitle(generated.title),
    } satisfies ThreadTitleGenerationResult;
  });

  const classifyImplementingJiraTickets: TextGenerationShape["classifyImplementingJiraTickets"] =
    Effect.fn("CursorTextGeneration.classifyImplementingJiraTickets")(function* (input) {
      if (input.modelSelection.provider !== "cursor") {
        return yield* new TextGenerationError({
          operation: "classifyImplementingJiraTickets",
          detail: "Invalid model selection.",
        });
      }
      if (input.jiraTickets.length === 0) {
        return { implementingKeys: [] };
      }

      const { prompt, outputSchema } = buildClassifyImplementingJiraTicketsPrompt({
        message: input.message,
        jiraTickets: input.jiraTickets,
      });

      const generated = yield* runCursorJson({
        operation: "classifyImplementingJiraTickets",
        cwd: input.cwd,
        prompt,
        outputSchemaJson: outputSchema,
        modelSelection: input.modelSelection,
      });

      return {
        implementingKeys: filterToAllowedKeys(generated.implementingKeys, input.jiraTickets),
      };
    });

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
    classifyImplementingJiraTickets,
  } satisfies TextGenerationShape;
});

export const CursorTextGenerationLive = Layer.effect(TextGeneration, makeCursorTextGeneration);
