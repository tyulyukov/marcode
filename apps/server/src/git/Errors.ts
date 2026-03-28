import { Schema } from "effect";

/**
 * GitCommandError - Git command execution failed.
 */
export class GitCommandError extends Schema.TaggedErrorClass<GitCommandError>()("GitCommandError", {
  operation: Schema.String,
  command: Schema.String,
  cwd: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return `Git command failed in ${this.operation}: ${this.command} (${this.cwd}) - ${this.detail}`;
  }
}

/**
 * GitHostCliError - Git host CLI execution or authentication failed.
 *
 * Covers both GitHub (`gh`) and GitLab (`glab`) CLI errors.
 */
export class GitHostCliError extends Schema.TaggedErrorClass<GitHostCliError>()("GitHostCliError", {
  operation: Schema.String,
  detail: Schema.String,
  provider: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return `Git host CLI failed in ${this.operation}: ${this.detail}`;
  }
}

/** @deprecated Use `GitHostCliError` instead. */
export type GitHubCliError = GitHostCliError;
/** @deprecated Use `GitHostCliError` instead. */
export const GitHubCliError = GitHostCliError;

/**
 * TextGenerationError - Commit or PR text generation failed.
 */
export class TextGenerationError extends Schema.TaggedErrorClass<TextGenerationError>()(
  "TextGenerationError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Text generation failed in ${this.operation}: ${this.detail}`;
  }
}

/**
 * GitManagerError - Stacked Git workflow orchestration failed.
 */
export class GitManagerError extends Schema.TaggedErrorClass<GitManagerError>()("GitManagerError", {
  operation: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return `Git manager failed in ${this.operation}: ${this.detail}`;
  }
}

/**
 * GitManagerServiceError - Errors emitted by stacked Git workflow orchestration.
 */
export type GitManagerServiceError =
  | GitManagerError
  | GitCommandError
  | GitHostCliError
  | TextGenerationError;
