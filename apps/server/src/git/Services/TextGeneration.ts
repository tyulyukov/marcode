/**
 * TextGeneration - Effect service contract for AI-generated Git content.
 *
 * Generates commit messages and pull request titles/bodies from repository
 * context prepared by Git services.
 *
 * @module TextGeneration
 */
import { Context } from "effect";
import type { Effect } from "effect";
import type { ChatAttachment, ModelSelection } from "@marcode/contracts";
import type { JiraTicketContext } from "@marcode/shared/jiraContext";

import type { TextGenerationError } from "@marcode/contracts";

/** Providers that support git text generation (commit messages, PR content, branch names). */
export type TextGenerationProvider = "codex" | "claudeAgent" | "cursor" | "opencode";

export interface CommitMessageGenerationInput {
  cwd: string;
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  /** When true, the model also returns a semantic branch name for the change. */
  includeBranch?: boolean;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
  /**
   * Jira tickets referenced in the source thread, if any. The prompt instructs
   * the model to engrave keys in the subject/body trailer only for tickets the
   * diff actually implements; missing/empty list ⇒ today's behavior.
   */
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

export interface CommitMessageGenerationResult {
  subject: string;
  body: string;
  /** Only present when `includeBranch` was set on the input. */
  branch?: string | undefined;
}

export interface PrContentGenerationInput {
  cwd: string;
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
  /** Jira tickets referenced in the source thread (see CommitMessageGenerationInput). */
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

export interface PrContentGenerationResult {
  title: string;
  body: string;
}

export interface BranchNameGenerationInput {
  cwd: string;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
  /** Jira tickets referenced in the source thread; engraved into the slug when present. */
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

export interface BranchNameGenerationResult {
  branch: string;
}

export interface ThreadTitleGenerationInput {
  cwd: string;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
  /** Jira tickets referenced in the source thread; may be folded into the title. */
  jiraTickets?: ReadonlyArray<JiraTicketContext>;
}

export interface ThreadTitleGenerationResult {
  title: string;
}

export interface ClassifyImplementingJiraTicketsInput {
  cwd: string;
  /**
   * The user's message text used as the classification signal — typically the
   * first user message in a thread, or the most recent message that introduced
   * new mentions.
   */
  message: string;
  /**
   * All Jira tickets referenced in the thread so far. The classifier picks a
   * subset that the user is actively implementing.
   */
  jiraTickets: ReadonlyArray<JiraTicketContext>;
  modelSelection: ModelSelection;
}

export interface ClassifyImplementingJiraTicketsResult {
  /**
   * Subset of input ticket keys the user is actively implementing. Tickets
   * mentioned for context only are excluded.
   */
  implementingKeys: ReadonlyArray<string>;
}

export interface TextGenerationService {
  generateCommitMessage(
    input: CommitMessageGenerationInput,
  ): Promise<CommitMessageGenerationResult>;
  generatePrContent(input: PrContentGenerationInput): Promise<PrContentGenerationResult>;
  generateBranchName(input: BranchNameGenerationInput): Promise<BranchNameGenerationResult>;
  generateThreadTitle(input: ThreadTitleGenerationInput): Promise<ThreadTitleGenerationResult>;
  classifyImplementingJiraTickets(
    input: ClassifyImplementingJiraTicketsInput,
  ): Promise<ClassifyImplementingJiraTicketsResult>;
}

/**
 * TextGenerationShape - Service API for commit/PR text generation.
 */
export interface TextGenerationShape {
  /**
   * Generate a commit message from staged change context.
   */
  readonly generateCommitMessage: (
    input: CommitMessageGenerationInput,
  ) => Effect.Effect<CommitMessageGenerationResult, TextGenerationError>;

  /**
   * Generate pull request title/body from branch and diff context.
   */
  readonly generatePrContent: (
    input: PrContentGenerationInput,
  ) => Effect.Effect<PrContentGenerationResult, TextGenerationError>;

  /**
   * Generate a concise branch name from a user message.
   */
  readonly generateBranchName: (
    input: BranchNameGenerationInput,
  ) => Effect.Effect<BranchNameGenerationResult, TextGenerationError>;

  /**
   * Generate a concise thread title from a user's first message.
   */
  readonly generateThreadTitle: (
    input: ThreadTitleGenerationInput,
  ) => Effect.Effect<ThreadTitleGenerationResult, TextGenerationError>;

  /**
   * Given the user's message text and a list of mentioned Jira tickets, return
   * the subset of ticket keys the user is actively implementing in this work
   * (vs. tickets mentioned purely for context/reference).
   */
  readonly classifyImplementingJiraTickets: (
    input: ClassifyImplementingJiraTicketsInput,
  ) => Effect.Effect<ClassifyImplementingJiraTicketsResult, TextGenerationError>;
}

/**
 * TextGeneration - Service tag for commit and PR text generation.
 */
export class TextGeneration extends Context.Service<TextGeneration, TextGenerationShape>()(
  "marcode/git/Services/TextGeneration",
) {}
