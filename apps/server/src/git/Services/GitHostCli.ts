/**
 * GitHostCli - Effect service contract for provider-agnostic git host CLI interactions.
 *
 * Abstracts over `gh` (GitHub) and `glab` (GitLab) CLIs so that higher-level
 * orchestration can work transparently with either hosting platform.
 *
 * @module GitHostCli
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { GitHostCliError } from "../Errors.ts";

export type GitHostProvider = "github" | "gitlab";

export interface HostPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state?: "open" | "closed" | "merged";
  readonly updatedAt?: string | null;
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

export interface HostRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

/**
 * GitHostCliShape - Provider-agnostic service API for git host CLI commands.
 */
export interface GitHostCliShape {
  readonly provider: GitHostProvider;

  readonly listPullRequests: (input: {
    readonly cwd: string;
    readonly headSelector: string;
    readonly state: "open" | "all";
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<HostPullRequestSummary>, GitHostCliError>;

  readonly getPullRequest: (input: {
    readonly cwd: string;
    readonly reference: string;
  }) => Effect.Effect<HostPullRequestSummary, GitHostCliError>;

  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly repository: string;
  }) => Effect.Effect<HostRepositoryCloneUrls, GitHostCliError>;

  readonly createPullRequest: (input: {
    readonly cwd: string;
    readonly baseBranch: string;
    readonly headSelector: string;
    readonly title: string;
    readonly body: string;
  }) => Effect.Effect<void, GitHostCliError>;

  readonly getDefaultBranch: (input: {
    readonly cwd: string;
  }) => Effect.Effect<string | null, GitHostCliError>;

  readonly checkoutPullRequest: (input: {
    readonly cwd: string;
    readonly reference: string;
    readonly force?: boolean;
  }) => Effect.Effect<void, GitHostCliError>;

  readonly pullRequestRefspecPrefix: () => string;

  readonly detectedProvider?: (input: {
    readonly cwd: string;
  }) => Effect.Effect<GitHostProvider, GitHostCliError>;

  readonly pullRequestRefspecPrefixForCwd?: (input: {
    readonly cwd: string;
  }) => Effect.Effect<string, GitHostCliError>;
}

/**
 * GitHostCli - Service tag for provider-agnostic git host CLI execution.
 */
export class GitHostCli extends ServiceMap.Service<GitHostCli, GitHostCliShape>()(
  "marcode/git/Services/GitHostCli",
) {}
