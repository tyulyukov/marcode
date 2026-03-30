import { Data } from "effect";

export class JiraTokenError extends Data.TaggedError("JiraTokenError")<{
  readonly operation: string;
  readonly detail: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return `[${this.operation}] ${this.detail}`;
  }
}

export class JiraApiError extends Data.TaggedError("JiraApiError")<{
  readonly operation: string;
  readonly detail: string;
  readonly statusCode?: number;
  readonly cause?: unknown;
}> {
  override get message(): string {
    const status = this.statusCode ? ` (${this.statusCode})` : "";
    return `[${this.operation}]${status} ${this.detail}`;
  }
}

export class JiraOAuthError extends Data.TaggedError("JiraOAuthError")<{
  readonly operation: string;
  readonly detail: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return `[${this.operation}] ${this.detail}`;
  }
}
