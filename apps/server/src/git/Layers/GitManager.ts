import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

import { Cache, Duration, Effect, Exit, Layer, Option, Path, Ref, Schedule, Schema } from "effect";
import {
  GitActionProgressEvent,
  GitActionProgressPhase,
  GitCommandError,
  GitHostCliError,
  GitRunStackedActionResult,
  GitStackedAction,
  type GitStatusLocalResult,
  type GitStatusRemoteResult,
  ModelSelection,
} from "@marcode/contracts";
import type { GitHostProvider } from "@marcode/contracts";
import {
  detectGitHostingProviderFromRemoteUrl,
  mergeGitStatusParts,
  resolveAutoFeatureBranchName,
  sanitizeBranchFragment,
  sanitizeFeatureBranchName,
} from "@marcode/shared/git";
import { resolveWorktreeHandoffIntent } from "@marcode/shared/worktreeHandoff";

import { GitManagerError } from "@marcode/contracts";
import {
  GitManager,
  type GitActionProgressReporter,
  type GitManagerShape,
  type GitRunStackedActionOptions,
} from "../Services/GitManager.ts";
import { GitCore, type GitStatusDetails } from "../Services/GitCore.ts";
import { GitHostCli } from "../Services/GitHostCli.ts";
import { TextGeneration } from "../Services/TextGeneration.ts";
import { ProjectSetupScriptRunner } from "../../project/Services/ProjectSetupScriptRunner.ts";
import { extractBranchNameFromRemoteRef } from "../remoteRefs.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { JiraContextCollector } from "../../jira/Services/JiraContextCollector.ts";
import { AnalyticsService } from "../../telemetry/Services/AnalyticsService.ts";
import type { JiraTicketContext } from "@marcode/shared/jiraContext";
import type { ThreadId } from "@marcode/contracts";
import type { GitManagerServiceError } from "@marcode/contracts";

const COMMIT_TIMEOUT_MS = 10 * 60_000;
const MAX_PROGRESS_TEXT_LENGTH = 500;
const SHORT_SHA_LENGTH = 7;
const TOAST_DESCRIPTION_MAX = 72;
const STATUS_RESULT_CACHE_TTL = Duration.seconds(1);
const STATUS_RESULT_CACHE_CAPACITY = 2_048;
const PR_CREATE_RETRY_ATTEMPTS = 5;
const PR_CREATE_RETRY_BASE_DELAY = Duration.seconds(2);

const BRANCH_NOT_READY_PATTERNS = [
  "head sha can't be blank",
  "base sha can't be blank",
  "head ref must be a branch",
  "no commits between",
] as const;

const isGitHostCliError = Schema.is(GitHostCliError);

function isBranchNotReadyError(error: unknown): boolean {
  if (!isGitHostCliError(error)) return false;
  const lower = error.detail.toLowerCase();
  return BRANCH_NOT_READY_PATTERNS.some((pattern) => lower.includes(pattern));
}
type StripProgressContext<T> = T extends any ? Omit<T, "actionId" | "cwd" | "action"> : never;
type GitActionProgressPayload = StripProgressContext<GitActionProgressEvent>;
type GitActionProgressEmitter = (event: GitActionProgressPayload) => Effect.Effect<void, never>;

function isNotGitRepositoryError(error: GitCommandError): boolean {
  return error.message.toLowerCase().includes("not a git repository");
}

interface OpenPrInfo {
  number: number;
  title: string;
  url: string;
  baseRefName: string;
  headRefName: string;
}

interface PullRequestInfo extends OpenPrInfo, PullRequestHeadRemoteInfo {
  state: "open" | "closed" | "merged";
  updatedAt: string | null;
}

interface ResolvedPullRequest {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  state: "open" | "closed" | "merged";
}

interface PullRequestHeadRemoteInfo {
  isCrossRepository?: boolean;
  headRepositoryNameWithOwner?: string | null;
  headRepositoryOwnerLogin?: string | null;
}

interface BranchHeadContext {
  localBranch: string;
  headBranch: string;
  headSelectors: ReadonlyArray<string>;
  preferredHeadSelector: string;
  remoteName: string | null;
  headRepositoryNameWithOwner: string | null;
  headRepositoryOwnerLogin: string | null;
  originRepositoryNameWithOwner: string | null;
  isCrossRepository: boolean;
}

interface FailedLocalHandoffRecovery {
  worktreeRecreated: boolean;
  worktreeChangesRestored: boolean;
  localChangesRestored: boolean;
  recoveryNotes: ReadonlyArray<string>;
}

interface FailedLocalTransferRecovery extends FailedLocalHandoffRecovery {
  localCheckoutRestored: boolean;
}

interface FailedWorktreeHandoffRecovery {
  checkoutRestored: boolean;
  stashRestored: boolean;
  recoveryNotes: ReadonlyArray<string>;
}

interface FailedWorktreeTransferRecovery extends FailedWorktreeHandoffRecovery {
  worktreeRemoved: boolean;
}

function parseRepositoryNameFromPullRequestUrl(url: string): string | null {
  const trimmed = url.trim();
  const ghMatch = /^https:\/\/[^/]+\/[^/]+\/([^/]+)\/pull\/\d+(?:\/.*)?$/i.exec(trimmed);
  if (ghMatch?.[1]?.trim()) return ghMatch[1].trim();
  const glMatch = /^https:\/\/[^/]+\/[^/]+\/([^/]+)\/-\/merge_requests\/\d+(?:\/.*)?$/i.exec(
    trimmed,
  );
  if (glMatch?.[1]?.trim()) return glMatch[1].trim();
  return null;
}

function resolveHeadRepositoryNameWithOwner(
  pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
): string | null {
  const explicitRepository = pullRequest.headRepositoryNameWithOwner?.trim() ?? "";
  if (explicitRepository.length > 0) {
    return explicitRepository;
  }

  if (!pullRequest.isCrossRepository) {
    return null;
  }

  const ownerLogin = pullRequest.headRepositoryOwnerLogin?.trim() ?? "";
  const repositoryName = parseRepositoryNameFromPullRequestUrl(pullRequest.url);
  if (ownerLogin.length === 0 || !repositoryName) {
    return null;
  }

  return `${ownerLogin}/${repositoryName}`;
}

function resolvePullRequestWorktreeLocalBranchName(
  pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
): string {
  if (!pullRequest.isCrossRepository) {
    return pullRequest.headBranch;
  }

  const sanitizedHeadBranch = sanitizeBranchFragment(pullRequest.headBranch).trim();
  const suffix = sanitizedHeadBranch.length > 0 ? sanitizedHeadBranch : "head";
  return `marcode/pr-${pullRequest.number}/${suffix}`;
}

function parseRepositoryNameWithOwnerFromRemoteUrl(url: string | null): string | null {
  const trimmed = url?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }

  const match =
    /^(?:git@[^:]+:|ssh:\/\/git@[^/]+\/|https:\/\/[^/]+\/|git:\/\/[^/]+\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i.exec(
      trimmed,
    );
  const repositoryNameWithOwner = match?.[1]?.trim() ?? "";
  return repositoryNameWithOwner.length > 0 ? repositoryNameWithOwner : null;
}

function parseRepositoryOwnerLogin(nameWithOwner: string | null): string | null {
  const trimmed = nameWithOwner?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  const [ownerLogin] = trimmed.split("/");
  const normalizedOwnerLogin = ownerLogin?.trim() ?? "";
  return normalizedOwnerLogin.length > 0 ? normalizedOwnerLogin : null;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalRepositoryNameWithOwner(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeOptionalOwnerLogin(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function resolvePullRequestHeadRepositoryNameWithOwner(
  pr: PullRequestHeadRemoteInfo & { url: string },
) {
  const explicitRepository = normalizeOptionalString(pr.headRepositoryNameWithOwner);
  if (explicitRepository) {
    return explicitRepository;
  }

  if (!pr.isCrossRepository) {
    return null;
  }

  const ownerLogin = normalizeOptionalString(pr.headRepositoryOwnerLogin);
  const repositoryName = parseRepositoryNameFromPullRequestUrl(pr.url);
  if (!ownerLogin || !repositoryName) {
    return null;
  }

  return `${ownerLogin}/${repositoryName}`;
}

function matchesBranchHeadContext(
  pr: PullRequestInfo,
  headContext: Pick<
    BranchHeadContext,
    "headBranch" | "headRepositoryNameWithOwner" | "headRepositoryOwnerLogin" | "isCrossRepository"
  >,
): boolean {
  if (pr.headRefName !== headContext.headBranch) {
    return false;
  }

  const expectedHeadRepository = normalizeOptionalRepositoryNameWithOwner(
    headContext.headRepositoryNameWithOwner,
  );
  const expectedHeadOwner =
    normalizeOptionalOwnerLogin(headContext.headRepositoryOwnerLogin) ??
    parseRepositoryOwnerLogin(expectedHeadRepository);
  const prHeadRepository = normalizeOptionalRepositoryNameWithOwner(
    resolvePullRequestHeadRepositoryNameWithOwner(pr),
  );
  const prHeadOwner =
    normalizeOptionalOwnerLogin(pr.headRepositoryOwnerLogin) ??
    parseRepositoryOwnerLogin(prHeadRepository);

  if (headContext.isCrossRepository) {
    if (pr.isCrossRepository === false) {
      return false;
    }
    if ((expectedHeadRepository || expectedHeadOwner) && !prHeadRepository && !prHeadOwner) {
      return false;
    }
    if (expectedHeadRepository && prHeadRepository && expectedHeadRepository !== prHeadRepository) {
      return false;
    }
    if (expectedHeadOwner && prHeadOwner && expectedHeadOwner !== prHeadOwner) {
      return false;
    }
    return true;
  }

  if (pr.isCrossRepository === true) {
    return false;
  }
  if (expectedHeadRepository && prHeadRepository && expectedHeadRepository !== prHeadRepository) {
    return false;
  }
  if (expectedHeadOwner && prHeadOwner && expectedHeadOwner !== prHeadOwner) {
    return false;
  }
  return true;
}

function gitManagerError(operation: string, detail: string, cause?: unknown): GitManagerError {
  return new GitManagerError({
    operation,
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function combineGitMessages(stdout: string, stderr: string): string | null {
  const parts = [stdout.trim(), stderr.trim()].filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n").trim();
}

function buildFailedLocalHandoffRecoveryDetail(
  baseMessage: string,
  recovery: FailedLocalHandoffRecovery,
): string {
  return `${baseMessage} ${[
    recovery.worktreeRecreated
      ? "The original worktree was recreated."
      : "The original worktree could not be recreated automatically.",
    recovery.worktreeChangesRestored
      ? "Recovered worktree changes were reapplied."
      : "Recovered worktree changes remain in the Git stash.",
    recovery.localChangesRestored
      ? "Previous local changes were restored."
      : "Previous local changes remain in the Git stash.",
    ...recovery.recoveryNotes,
  ].join(" ")}`.trim();
}

function buildFailedLocalTransferDetail(
  baseMessage: string,
  recovery: FailedLocalTransferRecovery,
): string {
  return `${baseMessage} ${[
    recovery.worktreeRecreated
      ? "The original worktree was recreated."
      : "The original worktree could not be recreated automatically.",
    recovery.worktreeChangesRestored
      ? "The thread changes were restored to that worktree."
      : "The thread changes remain in the Git stash.",
    recovery.localCheckoutRestored
      ? "Local checkout was restored."
      : "Local checkout could not be fully restored automatically.",
    recovery.localChangesRestored
      ? "Previous local changes were restored."
      : "Previous local changes remain in the Git stash.",
    ...recovery.recoveryNotes,
  ].join(" ")}`.trim();
}

function buildFailedWorktreeHandoffRecoveryDetail(
  baseMessage: string,
  recovery: FailedWorktreeHandoffRecovery,
): string {
  return `${baseMessage} ${[
    recovery.checkoutRestored
      ? "Local checkout was restored."
      : "Local checkout could not be fully restored automatically.",
    recovery.stashRestored
      ? "Previous local changes were restored."
      : "Previous local changes remain in the Git stash.",
    ...recovery.recoveryNotes,
  ].join(" ")}`.trim();
}

function buildFailedWorktreeTransferDetail(
  baseMessage: string,
  recovery: FailedWorktreeTransferRecovery,
): string {
  return `${baseMessage} ${[
    recovery.worktreeRemoved
      ? "The new worktree was removed."
      : "The new worktree could not be removed automatically.",
    recovery.checkoutRestored
      ? "Local checkout was restored."
      : "Local checkout could not be fully restored automatically.",
    recovery.stashRestored
      ? "Previous local changes were restored."
      : "Previous local changes remain in the Git stash. Run `git stash list` in Local to recover them.",
    ...recovery.recoveryNotes,
  ].join(" ")}`.trim();
}

function limitContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated]`;
}

function shortenSha(sha: string | undefined): string | null {
  if (!sha) return null;
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function truncateText(
  value: string | undefined,
  maxLength = TOAST_DESCRIPTION_MAX,
): string | undefined {
  if (!value) return undefined;
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return "...".slice(0, maxLength);
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function withDescription(title: string, description: string | undefined) {
  return description ? { title, description } : { title };
}

function summarizeGitActionResult(
  result: Pick<GitRunStackedActionResult, "commit" | "push" | "pr">,
  gitHostProvider?: GitHostProvider,
): {
  title: string;
  description?: string;
} {
  if (result.pr.status === "created" || result.pr.status === "opened_existing") {
    const prNumber = result.pr.number ? ` #${result.pr.number}` : "";
    const label = gitHostProvider === "gitlab" ? "MR" : "PR";
    const title = `${result.pr.status === "created" ? `Created ${label}` : `Opened ${label}`}${prNumber}`;
    return withDescription(title, truncateText(result.pr.title));
  }

  if (result.push.status === "pushed") {
    const shortSha = shortenSha(result.commit.commitSha);
    const branch = result.push.upstreamBranch ?? result.push.branch;
    const pushedCommitPart = shortSha ? ` ${shortSha}` : "";
    const branchPart = branch ? ` to ${branch}` : "";
    return withDescription(
      `Pushed${pushedCommitPart}${branchPart}`,
      truncateText(result.commit.subject),
    );
  }

  if (result.commit.status === "created") {
    const shortSha = shortenSha(result.commit.commitSha);
    const title = shortSha ? `Committed ${shortSha}` : "Committed changes";
    return withDescription(title, truncateText(result.commit.subject));
  }

  return { title: "Done" };
}

function sanitizeCommitMessage(generated: {
  subject: string;
  body: string;
  branch?: string | undefined;
}): {
  subject: string;
  body: string;
  branch?: string | undefined;
} {
  const rawSubject = generated.subject.trim().split(/\r?\n/g)[0]?.trim() ?? "";
  const subject = rawSubject.replace(/[.]+$/g, "").trim();
  const safeSubject = subject.length > 0 ? subject.slice(0, 72).trimEnd() : "Update project files";
  return {
    subject: safeSubject,
    body: generated.body.trim(),
    ...(generated.branch !== undefined ? { branch: generated.branch } : {}),
  };
}

function sanitizeProgressText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length <= MAX_PROGRESS_TEXT_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_PROGRESS_TEXT_LENGTH).trimEnd();
}

interface CommitAndBranchSuggestion {
  subject: string;
  body: string;
  branch?: string | undefined;
  commitMessage: string;
}

function isCommitAction(
  action: GitStackedAction,
): action is "commit" | "commit_push" | "commit_push_pr" {
  return action === "commit" || action === "commit_push" || action === "commit_push_pr";
}

function formatCommitMessage(subject: string, body: string): string {
  const trimmedBody = body.trim();
  if (trimmedBody.length === 0) {
    return subject;
  }
  return `${subject}\n\n${trimmedBody}`;
}

function parseCustomCommitMessage(raw: string): { subject: string; body: string } | null {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return null;
  }

  const [firstLine, ...rest] = normalized.split("\n");
  const subject = firstLine?.trim() ?? "";
  if (subject.length === 0) {
    return null;
  }

  return {
    subject,
    body: rest.join("\n").trim(),
  };
}

function appendUnique(values: string[], next: string | null | undefined): void {
  const trimmed = next?.trim() ?? "";
  if (trimmed.length === 0 || values.includes(trimmed)) {
    return;
  }
  values.push(trimmed);
}

function repositoryLocalName(
  repositoryNameWithOwner: string | null | undefined,
): string | undefined {
  const localName = repositoryNameWithOwner?.split("/").pop()?.trim();
  return localName && localName.length > 0 ? localName : undefined;
}

function toStatusPr(pr: PullRequestInfo): {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  state: "open" | "closed" | "merged";
} {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    baseBranch: pr.baseRefName,
    headBranch: pr.headRefName,
    state: pr.state,
  };
}

function normalizePullRequestReference(reference: string): string {
  const trimmed = reference.trim();
  const hashNumber = /^#(\d+)$/.exec(trimmed);
  return hashNumber?.[1] ?? trimmed;
}

function canonicalizeExistingPath(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return value;
  }
}

function toResolvedPullRequest(pr: {
  number: number;
  title: string;
  url: string;
  baseRefName: string;
  headRefName: string;
  state?: "open" | "closed" | "merged";
}): ResolvedPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    baseBranch: pr.baseRefName,
    headBranch: pr.headRefName,
    state: pr.state ?? "open",
  };
}

function shouldPreferSshRemote(url: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return trimmed.startsWith("git@") || trimmed.startsWith("ssh://");
}

function toPullRequestHeadRemoteInfo(pr: {
  isCrossRepository?: boolean;
  headRepositoryNameWithOwner?: string | null;
  headRepositoryOwnerLogin?: string | null;
}): PullRequestHeadRemoteInfo {
  return {
    ...(pr.isCrossRepository !== undefined ? { isCrossRepository: pr.isCrossRepository } : {}),
    ...(pr.headRepositoryNameWithOwner !== undefined
      ? { headRepositoryNameWithOwner: pr.headRepositoryNameWithOwner }
      : {}),
    ...(pr.headRepositoryOwnerLogin !== undefined
      ? { headRepositoryOwnerLogin: pr.headRepositoryOwnerLogin }
      : {}),
  };
}

export const makeGitManager = Effect.fn("makeGitManager")(function* () {
  const gitCore = yield* GitCore;
  const gitHostCli = yield* GitHostCli;
  const textGeneration = yield* TextGeneration;
  const projectSetupScriptRunner = yield* ProjectSetupScriptRunner;
  const serverSettingsService = yield* ServerSettingsService;
  const jiraContextCollector = yield* JiraContextCollector;
  const path = yield* Path.Path;
  const { worktreesDir } = yield* ServerConfig;
  const analytics = Option.getOrElse(yield* Effect.serviceOption(AnalyticsService), () => ({
    record: () => Effect.void,
    flush: Effect.void,
  }));

  const recordGitAnalytics = (
    event: string,
    properties: Record<string, unknown>,
    options?: Parameters<typeof analytics.record>[2],
  ) => analytics.record(event, properties, options);

  const resolveJiraTickets = (
    threadId: ThreadId | undefined,
  ): Effect.Effect<ReadonlyArray<JiraTicketContext>, never> =>
    threadId === undefined ? Effect.succeed([]) : jiraContextCollector.forThread(threadId);

  const createProgressEmitter = (
    input: { cwd: string; action: GitStackedAction },
    options?: GitRunStackedActionOptions,
  ) => {
    const actionId = options?.actionId ?? randomUUID();
    const reporter = options?.progressReporter;

    const emit = (event: GitActionProgressPayload) =>
      reporter
        ? reporter.publish({
            actionId,
            cwd: input.cwd,
            action: input.action,
            ...event,
          } as GitActionProgressEvent)
        : Effect.void;

    return {
      actionId,
      emit,
    };
  };

  const configurePullRequestHeadUpstreamBase = Effect.fn("configurePullRequestHeadUpstream")(
    function* (
      cwd: string,
      pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
      localBranch = pullRequest.headBranch,
    ) {
      const repositoryNameWithOwner = resolveHeadRepositoryNameWithOwner(pullRequest) ?? "";
      if (repositoryNameWithOwner.length === 0) {
        return;
      }

      const cloneUrls = yield* gitHostCli.getRepositoryCloneUrls({
        cwd,
        repository: repositoryNameWithOwner,
      });
      const originRemoteUrl = yield* gitCore.readConfigValue(cwd, "remote.origin.url");
      const remoteUrl = shouldPreferSshRemote(originRemoteUrl) ? cloneUrls.sshUrl : cloneUrls.url;
      const preferredRemoteName =
        pullRequest.headRepositoryOwnerLogin?.trim() ||
        repositoryNameWithOwner.split("/")[0]?.trim() ||
        "fork";
      const remoteName = yield* gitCore.ensureRemote({
        cwd,
        preferredName: preferredRemoteName,
        url: remoteUrl,
      });

      yield* gitCore.setBranchUpstream({
        cwd,
        branch: localBranch,
        remoteName,
        remoteBranch: pullRequest.headBranch,
      });
    },
  );

  const configurePullRequestHeadUpstream = (
    cwd: string,
    pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
    localBranch = pullRequest.headBranch,
  ) =>
    configurePullRequestHeadUpstreamBase(cwd, pullRequest, localBranch).pipe(
      Effect.catch((error) =>
        Effect.logWarning(
          `GitManager.configurePullRequestHeadUpstream: failed to configure upstream for ${localBranch} -> ${pullRequest.headBranch} in ${cwd}: ${error.message}`,
        ).pipe(Effect.asVoid),
      ),
    );

  const materializePullRequestHeadBranchBase = Effect.fn("materializePullRequestHeadBranch")(
    function* (
      cwd: string,
      pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
      localBranch = pullRequest.headBranch,
    ) {
      const repositoryNameWithOwner = resolveHeadRepositoryNameWithOwner(pullRequest) ?? "";

      if (repositoryNameWithOwner.length === 0) {
        yield* gitCore.fetchPullRequestBranch({
          cwd,
          prNumber: pullRequest.number,
          branch: localBranch,
        });
        return;
      }

      const cloneUrls = yield* gitHostCli.getRepositoryCloneUrls({
        cwd,
        repository: repositoryNameWithOwner,
      });
      const originRemoteUrl = yield* gitCore.readConfigValue(cwd, "remote.origin.url");
      const remoteUrl = shouldPreferSshRemote(originRemoteUrl) ? cloneUrls.sshUrl : cloneUrls.url;
      const preferredRemoteName =
        pullRequest.headRepositoryOwnerLogin?.trim() ||
        repositoryNameWithOwner.split("/")[0]?.trim() ||
        "fork";
      const remoteName = yield* gitCore.ensureRemote({
        cwd,
        preferredName: preferredRemoteName,
        url: remoteUrl,
      });

      yield* gitCore.fetchRemoteBranch({
        cwd,
        remoteName,
        remoteBranch: pullRequest.headBranch,
        localBranch,
      });
      yield* gitCore.setBranchUpstream({
        cwd,
        branch: localBranch,
        remoteName,
        remoteBranch: pullRequest.headBranch,
      });
    },
  );

  const materializePullRequestHeadBranch = (
    cwd: string,
    pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
    localBranch = pullRequest.headBranch,
  ) =>
    materializePullRequestHeadBranchBase(cwd, pullRequest, localBranch).pipe(
      Effect.catch(() =>
        gitCore.fetchPullRequestBranch({
          cwd,
          prNumber: pullRequest.number,
          branch: localBranch,
        }),
      ),
    );
  const normalizeStatusCacheKey = (cwd: string) => canonicalizeExistingPath(cwd);
  const nonRepositoryStatusDetails = {
    isRepo: false,
    hasOriginRemote: false,
    isDefaultBranch: false,
    branch: null,
    upstreamRef: null,
    hasWorkingTreeChanges: false,
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
  } satisfies GitStatusDetails;
  const readLocalStatus = Effect.fn("readLocalStatus")(function* (cwd: string) {
    const details = yield* gitCore
      .statusDetailsLocal(cwd)
      .pipe(
        Effect.catchIf(isNotGitRepositoryError, () => Effect.succeed(nonRepositoryStatusDetails)),
      );
    const hostingProvider = details.isRepo
      ? yield* resolveHostingProvider(cwd, details.branch)
      : null;

    return {
      isRepo: details.isRepo,
      ...(hostingProvider ? { hostingProvider } : {}),
      hasOriginRemote: details.hasOriginRemote,
      isDefaultBranch: details.isDefaultBranch,
      branch: details.branch,
      hasWorkingTreeChanges: details.hasWorkingTreeChanges,
      workingTree: details.workingTree,
    } satisfies GitStatusLocalResult;
  });
  const localStatusResultCache = yield* Cache.makeWith(readLocalStatus, {
    capacity: STATUS_RESULT_CACHE_CAPACITY,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? STATUS_RESULT_CACHE_TTL : Duration.zero),
  });
  const invalidateLocalStatusResultCache = (cwd: string) =>
    Cache.invalidate(localStatusResultCache, normalizeStatusCacheKey(cwd));
  const readRemoteStatus = Effect.fn("readRemoteStatus")(function* (cwd: string) {
    const details = yield* gitCore
      .statusDetails(cwd)
      .pipe(Effect.catchIf(isNotGitRepositoryError, () => Effect.succeed(null)));
    if (details === null || !details.isRepo) {
      return null;
    }

    const [pr, gitHostProvider] = yield* Effect.all(
      [
        details.branch !== null
          ? findLatestPr(cwd, {
              branch: details.branch,
              upstreamRef: details.upstreamRef,
            }).pipe(
              Effect.map((latest) => {
                if (!latest) return null;
                // On the default branch, only surface open PRs.
                // Merged/closed matches are usually reverse-merge history, not the thread's PR context.
                if (details.isDefaultBranch && latest.state !== "open") return null;
                return toStatusPr(latest);
              }),
              Effect.catch(() => Effect.succeed(null)),
            )
          : Effect.succeed(null),
        detectHostProvider(cwd).pipe(Effect.catch(() => Effect.succeed(undefined))),
      ],
      { concurrency: 2 },
    );

    return {
      hasUpstream: details.hasUpstream,
      aheadCount: details.aheadCount,
      behindCount: details.behindCount,
      pr,
      ...(gitHostProvider ? { gitHostProvider } : {}),
    } satisfies GitStatusRemoteResult;
  });
  const remoteStatusResultCache = yield* Cache.makeWith(readRemoteStatus, {
    capacity: STATUS_RESULT_CACHE_CAPACITY,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? STATUS_RESULT_CACHE_TTL : Duration.zero),
  });
  const invalidateRemoteStatusResultCache = (cwd: string) =>
    Cache.invalidate(remoteStatusResultCache, normalizeStatusCacheKey(cwd));

  const readConfigValueNullable = (cwd: string, key: string) =>
    gitCore.readConfigValue(cwd, key).pipe(Effect.catch(() => Effect.succeed(null)));

  const resolveHostingProvider = Effect.fn("resolveHostingProvider")(function* (
    cwd: string,
    branch: string | null,
  ) {
    const preferredRemoteName =
      branch === null
        ? "origin"
        : ((yield* readConfigValueNullable(cwd, `branch.${branch}.remote`)) ?? "origin");
    const remoteUrl =
      (yield* readConfigValueNullable(cwd, `remote.${preferredRemoteName}.url`)) ??
      (yield* readConfigValueNullable(cwd, "remote.origin.url"));

    return remoteUrl ? detectGitHostingProviderFromRemoteUrl(remoteUrl) : null;
  });

  const resolveRemoteRepositoryContext = Effect.fn("resolveRemoteRepositoryContext")(function* (
    cwd: string,
    remoteName: string | null,
  ) {
    if (!remoteName) {
      return {
        repositoryNameWithOwner: null,
        ownerLogin: null,
      };
    }

    const remoteUrl = yield* readConfigValueNullable(cwd, `remote.${remoteName}.url`);
    const repositoryNameWithOwner = parseRepositoryNameWithOwnerFromRemoteUrl(remoteUrl);
    return {
      repositoryNameWithOwner,
      ownerLogin: parseRepositoryOwnerLogin(repositoryNameWithOwner),
    };
  });

  const resolveBranchHeadContext = Effect.fn("resolveBranchHeadContext")(function* (
    cwd: string,
    details: { branch: string; upstreamRef: string | null },
  ) {
    const remoteName = yield* readConfigValueNullable(cwd, `branch.${details.branch}.remote`);
    const headBranchFromUpstream = details.upstreamRef
      ? extractBranchNameFromRemoteRef(details.upstreamRef, { remoteName })
      : "";
    const headBranch = headBranchFromUpstream.length > 0 ? headBranchFromUpstream : details.branch;
    const shouldProbeLocalBranchSelector =
      headBranchFromUpstream.length === 0 || headBranch === details.branch;

    const [remoteRepository, originRepository] = yield* Effect.all(
      [
        resolveRemoteRepositoryContext(cwd, remoteName),
        resolveRemoteRepositoryContext(cwd, "origin"),
      ],
      { concurrency: "unbounded" },
    );

    const isCrossRepository =
      remoteRepository.repositoryNameWithOwner !== null &&
      originRepository.repositoryNameWithOwner !== null
        ? remoteRepository.repositoryNameWithOwner.toLowerCase() !==
          originRepository.repositoryNameWithOwner.toLowerCase()
        : remoteName !== null &&
          remoteName !== "origin" &&
          remoteRepository.repositoryNameWithOwner !== null;

    const ownerHeadSelector =
      remoteRepository.ownerLogin && headBranch.length > 0
        ? `${remoteRepository.ownerLogin}:${headBranch}`
        : null;
    const remoteAliasHeadSelector =
      remoteName && headBranch.length > 0 ? `${remoteName}:${headBranch}` : null;
    const shouldProbeRemoteOwnedSelectors =
      isCrossRepository || (remoteName !== null && remoteName !== "origin");

    const headSelectors: string[] = [];
    if (isCrossRepository && shouldProbeRemoteOwnedSelectors) {
      appendUnique(headSelectors, ownerHeadSelector);
      appendUnique(
        headSelectors,
        remoteAliasHeadSelector !== ownerHeadSelector ? remoteAliasHeadSelector : null,
      );
    }
    if (shouldProbeLocalBranchSelector) {
      appendUnique(headSelectors, details.branch);
    }
    appendUnique(headSelectors, headBranch !== details.branch ? headBranch : null);
    if (!isCrossRepository && shouldProbeRemoteOwnedSelectors) {
      appendUnique(headSelectors, ownerHeadSelector);
      appendUnique(
        headSelectors,
        remoteAliasHeadSelector !== ownerHeadSelector ? remoteAliasHeadSelector : null,
      );
    }

    return {
      localBranch: details.branch,
      headBranch,
      headSelectors,
      preferredHeadSelector:
        ownerHeadSelector && isCrossRepository ? ownerHeadSelector : headBranch,
      remoteName,
      headRepositoryNameWithOwner: remoteRepository.repositoryNameWithOwner,
      headRepositoryOwnerLogin: remoteRepository.ownerLogin,
      originRepositoryNameWithOwner: originRepository.repositoryNameWithOwner,
      isCrossRepository,
    } satisfies BranchHeadContext;
  });

  const detectHostProvider = (cwd: string): Effect.Effect<GitHostProvider | undefined> => {
    if (gitHostCli.detectedProvider) {
      return gitHostCli
        .detectedProvider({ cwd })
        .pipe(
          Effect.catch((): Effect.Effect<GitHostProvider | undefined> => Effect.succeed(undefined)),
        );
    }
    return Effect.succeed(gitHostCli.provider as GitHostProvider | undefined);
  };

  const findOpenPr = Effect.fn("findOpenPr")(function* (
    cwd: string,
    headContext: Pick<
      BranchHeadContext,
      | "headBranch"
      | "headSelectors"
      | "headRepositoryNameWithOwner"
      | "headRepositoryOwnerLogin"
      | "originRepositoryNameWithOwner"
      | "isCrossRepository"
    >,
  ) {
    const originRepo = headContext.originRepositoryNameWithOwner;
    for (const headSelector of headContext.headSelectors) {
      const pullRequests = yield* gitHostCli.listPullRequests({
        cwd,
        headSelector,
        state: "open",
        limit: 1,
        ...(originRepo ? { repo: originRepo } : {}),
      });
      const normalizedPullRequests: PullRequestInfo[] = [];
      for (const pr of pullRequests) {
        const info: PullRequestInfo = {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          baseRefName: pr.baseRefName,
          headRefName: pr.headRefName,
          state: pr.state ?? "open",
          updatedAt: pr.updatedAt ?? null,
        };
        if (pr.isCrossRepository !== undefined) info.isCrossRepository = pr.isCrossRepository;
        if (pr.headRepositoryNameWithOwner !== undefined)
          info.headRepositoryNameWithOwner = pr.headRepositoryNameWithOwner;
        if (pr.headRepositoryOwnerLogin !== undefined)
          info.headRepositoryOwnerLogin = pr.headRepositoryOwnerLogin;
        normalizedPullRequests.push(info);
      }

      const firstPullRequest = normalizedPullRequests.find((pullRequest) =>
        matchesBranchHeadContext(pullRequest, headContext),
      );
      if (firstPullRequest) {
        return firstPullRequest;
      }
    }

    return null;
  });

  const findLatestPr = Effect.fn("findLatestPr")(function* (
    cwd: string,
    details: { branch: string; upstreamRef: string | null },
  ) {
    const headContext = yield* resolveBranchHeadContext(cwd, details);
    const parsedByNumber = new Map<number, PullRequestInfo>();

    const originRepo = headContext.originRepositoryNameWithOwner;
    for (const headSelector of headContext.headSelectors) {
      const pullRequests = yield* gitHostCli.listPullRequests({
        cwd,
        headSelector,
        state: "all",
        limit: 20,
        ...(originRepo ? { repo: originRepo } : {}),
      });

      for (const pr of pullRequests) {
        const normalizedState: "open" | "closed" | "merged" = pr.state ?? "open";
        parsedByNumber.set(pr.number, {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          baseRefName: pr.baseRefName,
          headRefName: pr.headRefName,
          state: normalizedState,
          updatedAt: pr.updatedAt ?? null,
          ...(pr.isCrossRepository !== undefined
            ? { isCrossRepository: pr.isCrossRepository }
            : {}),
          ...(pr.headRepositoryNameWithOwner !== undefined
            ? { headRepositoryNameWithOwner: pr.headRepositoryNameWithOwner }
            : {}),
          ...(pr.headRepositoryOwnerLogin !== undefined
            ? { headRepositoryOwnerLogin: pr.headRepositoryOwnerLogin }
            : {}),
        });
      }
    }

    const parsed = Array.from(parsedByNumber.values())
      .filter((pr) => matchesBranchHeadContext(pr, headContext))
      .toSorted((a, b) => {
        const left = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const right = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return right - left;
      });

    const latestOpenPr = parsed.find((pr) => pr.state === "open");
    if (latestOpenPr) {
      return latestOpenPr;
    }
    return parsed[0] ?? null;
  });

  const buildCompletionToast = Effect.fn("buildCompletionToast")(function* (
    cwd: string,
    result: Pick<GitRunStackedActionResult, "action" | "branch" | "commit" | "push" | "pr">,
  ) {
    const hostProvider = yield* detectHostProvider(cwd).pipe(
      Effect.catch(() => Effect.succeed(undefined)),
    );
    const summary = summarizeGitActionResult(result, hostProvider);
    let latestOpenPr: PullRequestInfo | null = null;
    let currentBranchIsDefault = false;
    let finalBranchContext: {
      branch: string;
      upstreamRef: string | null;
      hasUpstream: boolean;
    } | null = null;

    if (result.action !== "commit") {
      const finalStatus = yield* gitCore.statusDetails(cwd);
      if (finalStatus.branch) {
        finalBranchContext = {
          branch: finalStatus.branch,
          upstreamRef: finalStatus.upstreamRef,
          hasUpstream: finalStatus.hasUpstream,
        };
        currentBranchIsDefault = finalStatus.isDefaultBranch;
      }
    }

    const explicitResultPr =
      (result.pr.status === "created" || result.pr.status === "opened_existing") && result.pr.url
        ? {
            url: result.pr.url,
            state: "open" as const,
          }
        : null;
    const shouldLookupExistingOpenPr =
      (result.action === "commit_push" || result.action === "push") &&
      result.push.status === "pushed" &&
      result.branch.status !== "created" &&
      !currentBranchIsDefault &&
      explicitResultPr === null &&
      finalBranchContext?.hasUpstream === true;

    if (shouldLookupExistingOpenPr && finalBranchContext) {
      latestOpenPr = yield* resolveBranchHeadContext(cwd, {
        branch: finalBranchContext.branch,
        upstreamRef: finalBranchContext.upstreamRef,
      }).pipe(
        Effect.flatMap((headContext) => findOpenPr(cwd, headContext)),
        Effect.catch(() => Effect.succeed(null)),
      );
    }

    const openPr = latestOpenPr ?? explicitResultPr;
    const prOrMr = hostProvider === "gitlab" ? "MR" : "PR";

    const cta =
      result.action === "commit" && result.commit.status === "created"
        ? {
            kind: "run_action" as const,
            label: "Push",
            action: { kind: "push" as const },
          }
        : (result.action === "push" ||
              result.action === "create_pr" ||
              result.action === "commit_push" ||
              result.action === "commit_push_pr") &&
            openPr?.url &&
            (!currentBranchIsDefault ||
              result.pr.status === "created" ||
              result.pr.status === "opened_existing")
          ? {
              kind: "open_pr" as const,
              label: `View ${prOrMr}`,
              url: openPr.url,
            }
          : (result.action === "push" || result.action === "commit_push") &&
              result.push.status === "pushed" &&
              !currentBranchIsDefault
            ? {
                kind: "run_action" as const,
                label: `Create ${prOrMr}`,
                action: { kind: "create_pr" as const },
              }
            : {
                kind: "none" as const,
              };

    return {
      ...summary,
      cta,
    };
  });

  const resolveBaseBranch = Effect.fn("resolveBaseBranch")(function* (
    cwd: string,
    branch: string,
    upstreamRef: string | null,
    headContext: Pick<BranchHeadContext, "isCrossRepository" | "remoteName">,
  ) {
    const configured = yield* gitCore.readConfigValue(cwd, `branch.${branch}.gh-merge-base`);
    if (configured) return configured;

    if (upstreamRef && !headContext.isCrossRepository) {
      const upstreamBranch = extractBranchNameFromRemoteRef(upstreamRef, {
        remoteName: headContext.remoteName,
      });
      if (upstreamBranch.length > 0 && upstreamBranch !== branch) {
        return upstreamBranch;
      }
    }

    const defaultFromGh = yield* gitHostCli
      .getDefaultBranch({ cwd })
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (defaultFromGh) {
      return defaultFromGh;
    }

    return "main";
  });

  const resolveCommitAndBranchSuggestion = Effect.fn("resolveCommitAndBranchSuggestion")(
    function* (input: {
      cwd: string;
      branch: string | null;
      commitMessage?: string;
      /** When true, also produce a semantic feature branch name. */
      includeBranch?: boolean;
      filePaths?: readonly string[];
      modelSelection: ModelSelection;
      jiraTickets?: ReadonlyArray<JiraTicketContext>;
    }) {
      const context = yield* gitCore.prepareCommitContext(input.cwd, input.filePaths);
      if (!context) {
        return null;
      }

      const customCommit = parseCustomCommitMessage(input.commitMessage ?? "");
      if (customCommit) {
        return {
          subject: customCommit.subject,
          body: customCommit.body,
          ...(input.includeBranch
            ? { branch: sanitizeFeatureBranchName(customCommit.subject) }
            : {}),
          commitMessage: formatCommitMessage(customCommit.subject, customCommit.body),
        };
      }

      const generated = yield* textGeneration
        .generateCommitMessage({
          cwd: input.cwd,
          branch: input.branch,
          stagedSummary: limitContext(context.stagedSummary, 8_000),
          stagedPatch: limitContext(context.stagedPatch, 50_000),
          ...(input.includeBranch ? { includeBranch: true } : {}),
          modelSelection: input.modelSelection,
          ...(input.jiraTickets && input.jiraTickets.length > 0
            ? { jiraTickets: input.jiraTickets }
            : {}),
        })
        .pipe(Effect.map((result) => sanitizeCommitMessage(result)));

      return {
        subject: generated.subject,
        body: generated.body,
        ...(generated.branch !== undefined ? { branch: generated.branch } : {}),
        commitMessage: formatCommitMessage(generated.subject, generated.body),
      };
    },
  );

  const runCommitStep = Effect.fn("runCommitStep")(function* (
    modelSelection: ModelSelection,
    cwd: string,
    action: "commit" | "commit_push" | "commit_push_pr",
    branch: string | null,
    commitMessage?: string,
    preResolvedSuggestion?: CommitAndBranchSuggestion,
    filePaths?: readonly string[],
    progressReporter?: GitActionProgressReporter,
    actionId?: string,
    jiraTickets?: ReadonlyArray<JiraTicketContext>,
  ) {
    const emit = (event: GitActionProgressPayload) =>
      progressReporter && actionId
        ? progressReporter.publish({
            actionId,
            cwd,
            action,
            ...event,
          } as GitActionProgressEvent)
        : Effect.void;

    let suggestion: CommitAndBranchSuggestion | null | undefined = preResolvedSuggestion;
    if (!suggestion) {
      const needsGeneration = !commitMessage?.trim();
      if (needsGeneration) {
        yield* emit({
          kind: "phase_started",
          phase: "commit",
          label: "Generating commit message...",
        });
      }
      suggestion = yield* resolveCommitAndBranchSuggestion({
        cwd,
        branch,
        ...(commitMessage ? { commitMessage } : {}),
        ...(filePaths ? { filePaths } : {}),
        modelSelection,
        ...(jiraTickets && jiraTickets.length > 0 ? { jiraTickets } : {}),
      });
    }
    if (!suggestion) {
      return { status: "skipped_no_changes" as const };
    }

    yield* emit({
      kind: "phase_started",
      phase: "commit",
      label: "Committing...",
    });

    let currentHookName: string | null = null;
    const commitProgress =
      progressReporter && actionId
        ? {
            onOutputLine: ({ stream, text }: { stream: "stdout" | "stderr"; text: string }) => {
              const sanitized = sanitizeProgressText(text);
              if (!sanitized) {
                return Effect.void;
              }
              return emit({
                kind: "hook_output",
                hookName: currentHookName,
                stream,
                text: sanitized,
              });
            },
            onHookStarted: (hookName: string) => {
              currentHookName = hookName;
              return emit({
                kind: "hook_started",
                hookName,
              });
            },
            onHookFinished: ({
              hookName,
              exitCode,
              durationMs,
            }: {
              hookName: string;
              exitCode: number | null;
              durationMs: number | null;
            }) => {
              if (currentHookName === hookName) {
                currentHookName = null;
              }
              return emit({
                kind: "hook_finished",
                hookName,
                exitCode,
                durationMs,
              });
            },
          }
        : null;
    const { commitSha } = yield* gitCore.commit(cwd, suggestion.subject, suggestion.body, {
      timeoutMs: COMMIT_TIMEOUT_MS,
      ...(commitProgress ? { progress: commitProgress } : {}),
    });
    if (currentHookName !== null) {
      yield* emit({
        kind: "hook_finished",
        hookName: currentHookName,
        exitCode: 0,
        durationMs: null,
      });
      currentHookName = null;
    }
    return {
      status: "created" as const,
      commitSha,
      subject: suggestion.subject,
    };
  });

  const runPrStep = Effect.fn("runPrStep")(function* (
    modelSelection: ModelSelection,
    cwd: string,
    fallbackBranch: string | null,
    emit: GitActionProgressEmitter,
    jiraTickets?: ReadonlyArray<JiraTicketContext>,
  ) {
    const details = yield* gitCore.statusDetails(cwd);
    const branch = details.branch ?? fallbackBranch;
    if (!branch) {
      return yield* gitManagerError(
        "runPrStep",
        "Cannot create a pull request from detached HEAD.",
      );
    }
    if (!details.hasUpstream) {
      return yield* gitManagerError(
        "runPrStep",
        "Current branch has not been pushed. Push before creating a PR.",
      );
    }

    const headContext = yield* resolveBranchHeadContext(cwd, {
      branch,
      upstreamRef: details.upstreamRef,
    });

    const existing = yield* findOpenPr(cwd, headContext);
    if (existing) {
      return {
        status: "opened_existing" as const,
        url: existing.url,
        number: existing.number,
        baseBranch: existing.baseRefName,
        headBranch: existing.headRefName,
        title: existing.title,
      };
    }

    const baseBranch = yield* resolveBaseBranch(cwd, branch, details.upstreamRef, headContext);
    const detectedHostProvider = yield* detectHostProvider(cwd);
    const prOrMr = detectedHostProvider === "gitlab" ? "MR" : "PR";
    const changeRequestKind = detectedHostProvider === "gitlab" ? "mr" : "pr";
    const repositoryName = repositoryLocalName(headContext.originRepositoryNameWithOwner);
    yield* emit({
      kind: "phase_started",
      phase: "pr",
      label: `Generating ${prOrMr} content...`,
    });
    const rangeContext = yield* gitCore.readRangeContext(cwd, baseBranch);

    const generated = yield* textGeneration.generatePrContent({
      cwd,
      baseBranch,
      headBranch: headContext.headBranch,
      commitSummary: limitContext(rangeContext.commitSummary, 20_000),
      diffSummary: limitContext(rangeContext.diffSummary, 20_000),
      diffPatch: limitContext(rangeContext.diffPatch, 60_000),
      modelSelection,
      ...(jiraTickets && jiraTickets.length > 0 ? { jiraTickets } : {}),
    });

    yield* emit({
      kind: "phase_started",
      phase: "pr",
      label: `Creating ${prOrMr}...`,
    });
    const originRepo = headContext.originRepositoryNameWithOwner;
    const createStartedAtMs = Date.now();
    const baseAnalyticsProperties = {
      "git.host.provider": detectedHostProvider ?? "unknown",
      "git.change_request.kind": changeRequestKind,
      "git.branch": headContext.headBranch,
      ...(repositoryName ? { "repository.name": repositoryName } : {}),
    };
    const recordCreateResult = (outcome: "created" | "error", hasUrl: boolean) => {
      const completedAtMs = Date.now();
      const durationMs = Math.max(1, completedAtMs - createStartedAtMs);
      return recordGitAnalytics(
        "marcode.git.pr_mr.create",
        {
          ...baseAnalyticsProperties,
          outcome,
          has_url: hasUrl,
          "duration.ms": durationMs,
        },
        {
          durationMs,
          startedAt: createStartedAtMs,
          spanEvents: [
            {
              name: "marcode.git.pr_mr.create.requested",
              at: createStartedAtMs,
            },
            {
              name: "marcode.git.pr_mr.create.completed",
              at: completedAtMs,
              attributes: { outcome, has_url: hasUrl },
            },
          ],
        },
      );
    };
    yield* gitHostCli
      .createPullRequest({
        cwd,
        baseBranch,
        headSelector: headContext.preferredHeadSelector,
        title: generated.title,
        body: generated.body,
        ...(originRepo ? { repo: originRepo } : {}),
      })
      .pipe(
        Effect.retry({
          times: PR_CREATE_RETRY_ATTEMPTS,
          schedule: Schedule.exponential(PR_CREATE_RETRY_BASE_DELAY, 2),
          while: isBranchNotReadyError,
        }),
        Effect.tapError(() => recordCreateResult("error", false)),
      );

    const created = yield* findOpenPr(cwd, headContext);
    yield* recordCreateResult("created", Boolean(created?.url));
    if (!created) {
      return {
        status: "created" as const,
        baseBranch,
        headBranch: headContext.headBranch,
        title: generated.title,
      };
    }

    return {
      status: "created" as const,
      url: created.url,
      number: created.number,
      baseBranch: created.baseRefName,
      headBranch: created.headRefName,
      title: created.title,
    };
  });

  const localStatus: GitManagerShape["localStatus"] = Effect.fn("localStatus")(function* (input) {
    return yield* Cache.get(localStatusResultCache, normalizeStatusCacheKey(input.cwd));
  });
  const remoteStatus: GitManagerShape["remoteStatus"] = Effect.fn("remoteStatus")(
    function* (input) {
      return yield* Cache.get(remoteStatusResultCache, normalizeStatusCacheKey(input.cwd));
    },
  );
  const status: GitManagerShape["status"] = Effect.fn("status")(function* (input) {
    const [local, remote] = yield* Effect.all([localStatus(input), remoteStatus(input)]);
    return mergeGitStatusParts(local, remote);
  });
  const invalidateLocalStatus: GitManagerShape["invalidateLocalStatus"] = Effect.fn(
    "invalidateLocalStatus",
  )(function* (cwd) {
    yield* invalidateLocalStatusResultCache(cwd);
  });
  const invalidateRemoteStatus: GitManagerShape["invalidateRemoteStatus"] = Effect.fn(
    "invalidateRemoteStatus",
  )(function* (cwd) {
    yield* invalidateRemoteStatusResultCache(cwd);
  });
  const invalidateStatus: GitManagerShape["invalidateStatus"] = Effect.fn("invalidateStatus")(
    function* (cwd) {
      yield* invalidateLocalStatusResultCache(cwd);
      yield* invalidateRemoteStatusResultCache(cwd);
    },
  );

  const resolvePullRequest: GitManagerShape["resolvePullRequest"] = Effect.fn("resolvePullRequest")(
    function* (input) {
      const pullRequest = yield* gitHostCli
        .getPullRequest({
          cwd: input.cwd,
          reference: normalizePullRequestReference(input.reference),
        })
        .pipe(Effect.map((resolved) => toResolvedPullRequest(resolved)));

      return { pullRequest };
    },
  );

  const preparePullRequestThread: GitManagerShape["preparePullRequestThread"] = Effect.fn(
    "preparePullRequestThread",
  )(function* (input) {
    const maybeRunSetupScript = (worktreePath: string) => {
      if (!input.threadId) {
        return Effect.void;
      }
      return projectSetupScriptRunner
        .runForThread({
          threadId: input.threadId,
          projectCwd: input.cwd,
          worktreePath,
        })
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning(
              `GitManager.preparePullRequestThread: failed to launch worktree setup script for thread ${input.threadId} in ${worktreePath}: ${error.message}`,
            ).pipe(Effect.asVoid),
          ),
        );
    };
    return yield* Effect.gen(function* () {
      const normalizedReference = normalizePullRequestReference(input.reference);
      const rootWorktreePath = canonicalizeExistingPath(input.cwd);
      const pullRequestSummary = yield* gitHostCli.getPullRequest({
        cwd: input.cwd,
        reference: normalizedReference,
      });
      const pullRequest = toResolvedPullRequest(pullRequestSummary);

      if (input.mode === "local") {
        yield* gitHostCli.checkoutPullRequest({
          cwd: input.cwd,
          reference: normalizedReference,
          force: true,
        });
        const details = yield* gitCore.statusDetails(input.cwd);
        yield* configurePullRequestHeadUpstream(
          input.cwd,
          {
            ...pullRequest,
            ...toPullRequestHeadRemoteInfo(pullRequestSummary),
          },
          details.branch ?? pullRequest.headBranch,
        );
        return {
          pullRequest,
          branch: details.branch ?? pullRequest.headBranch,
          worktreePath: null,
        };
      }

      const ensureExistingWorktreeUpstream = Effect.fn("ensureExistingWorktreeUpstream")(function* (
        worktreePath: string,
      ) {
        const details = yield* gitCore.statusDetails(worktreePath);
        yield* configurePullRequestHeadUpstream(
          worktreePath,
          {
            ...pullRequest,
            ...toPullRequestHeadRemoteInfo(pullRequestSummary),
          },
          details.branch ?? pullRequest.headBranch,
        );
      });

      const pullRequestWithRemoteInfo = {
        ...pullRequest,
        ...toPullRequestHeadRemoteInfo(pullRequestSummary),
      } as const;
      const localPullRequestBranch =
        resolvePullRequestWorktreeLocalBranchName(pullRequestWithRemoteInfo);

      const findLocalHeadBranch = (cwd: string) =>
        gitCore.listBranches({ cwd }).pipe(
          Effect.map((result) => {
            const localBranch = result.branches.find(
              (branch) => !branch.isRemote && branch.name === localPullRequestBranch,
            );
            if (localBranch) {
              return localBranch;
            }
            if (localPullRequestBranch === pullRequest.headBranch) {
              return null;
            }
            return (
              result.branches.find(
                (branch) =>
                  !branch.isRemote &&
                  branch.name === pullRequest.headBranch &&
                  branch.worktreePath !== null &&
                  canonicalizeExistingPath(branch.worktreePath) !== rootWorktreePath,
              ) ?? null
            );
          }),
        );

      const existingBranchBeforeFetch = yield* findLocalHeadBranch(input.cwd);
      const existingBranchBeforeFetchPath = existingBranchBeforeFetch?.worktreePath
        ? canonicalizeExistingPath(existingBranchBeforeFetch.worktreePath)
        : null;
      if (
        existingBranchBeforeFetch?.worktreePath &&
        existingBranchBeforeFetchPath !== rootWorktreePath
      ) {
        yield* ensureExistingWorktreeUpstream(existingBranchBeforeFetch.worktreePath);
        return {
          pullRequest,
          branch: localPullRequestBranch,
          worktreePath: existingBranchBeforeFetch.worktreePath,
        };
      }
      if (existingBranchBeforeFetchPath === rootWorktreePath) {
        return yield* gitManagerError(
          "preparePullRequestThread",
          "This PR branch is already checked out in the main repo. Use Local, or switch the main repo off that branch before creating a worktree thread.",
        );
      }

      yield* materializePullRequestHeadBranch(
        input.cwd,
        pullRequestWithRemoteInfo,
        localPullRequestBranch,
      );

      const existingBranchAfterFetch = yield* findLocalHeadBranch(input.cwd);
      const existingBranchAfterFetchPath = existingBranchAfterFetch?.worktreePath
        ? canonicalizeExistingPath(existingBranchAfterFetch.worktreePath)
        : null;
      if (
        existingBranchAfterFetch?.worktreePath &&
        existingBranchAfterFetchPath !== rootWorktreePath
      ) {
        yield* ensureExistingWorktreeUpstream(existingBranchAfterFetch.worktreePath);
        return {
          pullRequest,
          branch: localPullRequestBranch,
          worktreePath: existingBranchAfterFetch.worktreePath,
        };
      }
      if (existingBranchAfterFetchPath === rootWorktreePath) {
        return yield* gitManagerError(
          "preparePullRequestThread",
          "This PR branch is already checked out in the main repo. Use Local, or switch the main repo off that branch before creating a worktree thread.",
        );
      }

      const worktree = yield* gitCore.createWorktree({
        cwd: input.cwd,
        branch: localPullRequestBranch,
        path: null,
      });
      yield* ensureExistingWorktreeUpstream(worktree.worktree.path);
      yield* maybeRunSetupScript(worktree.worktree.path);

      return {
        pullRequest,
        branch: worktree.worktree.branch,
        worktreePath: worktree.worktree.path,
      };
    }).pipe(Effect.ensuring(invalidateStatus(input.cwd)));
  });

  const readStashRef = (cwd: string) =>
    gitCore
      .execute({
        operation: "GitManager.handoffThread.readStashRef",
        cwd,
        args: ["rev-parse", "--verify", "--quiet", "refs/stash"],
        allowNonZeroExit: true,
        timeoutMs: 5_000,
      })
      .pipe(
        Effect.map((result) => {
          if (result.code !== 0) return null;
          const trimmed = result.stdout.trim();
          return trimmed.length > 0 ? trimmed : null;
        }),
      );

  const readHeadRef = (cwd: string) =>
    gitCore
      .execute({
        operation: "GitManager.handoffThread.readHeadRef",
        cwd,
        args: ["rev-parse", "HEAD"],
        timeoutMs: 5_000,
      })
      .pipe(
        Effect.map((result) => {
          const trimmed = result.stdout.trim();
          return trimmed.length > 0 ? trimmed : null;
        }),
      );

  const checkoutDetached = (cwd: string, ref: string) =>
    gitCore
      .execute({
        operation: "GitManager.handoffThread.checkoutDetached",
        cwd,
        args: ["checkout", "--detach", ref],
        timeoutMs: 30_000,
      })
      .pipe(Effect.asVoid);

  const buildNamedWorktreePath = (cwd: string, name: string) => {
    const repoName = path.basename(cwd);
    const sanitizedName = name.trim().replaceAll("/", "-");
    return path.join(worktreesDir, repoName, sanitizedName);
  };

  const buildDetachedWorktreePath = (cwd: string) => {
    const repoName = path.basename(cwd);
    const shortId = randomUUID().replace(/-/g, "").slice(0, 8);
    return path.join(worktreesDir, repoName, `marcode-detached-${shortId}`);
  };

  const createDetachedWorktreeAt = (input: { cwd: string; ref: string; path: string }) =>
    gitCore
      .execute({
        operation: "GitManager.handoffThread.createDetachedWorktree",
        cwd: input.cwd,
        args: ["worktree", "add", "--detach", input.path, input.ref],
        timeoutMs: 60_000,
      })
      .pipe(
        Effect.map(() => ({
          worktree: {
            path: input.path,
            ref: input.ref,
            branch: null as string | null,
          },
        })),
      );

  const createDetachedWorktree = (input: {
    cwd: string;
    ref: string;
    path: string | null;
    name?: string | null;
  }) =>
    Effect.gen(function* () {
      const resolvedPath =
        input.path ??
        (input.name
          ? buildNamedWorktreePath(input.cwd, input.name)
          : buildDetachedWorktreePath(input.cwd));
      return yield* createDetachedWorktreeAt({
        cwd: input.cwd,
        ref: input.ref,
        path: resolvedPath,
      });
    });

  const createNamedWorktree = (input: {
    cwd: string;
    baseBranch: string;
    name: string;
    path: string | null;
  }) =>
    Effect.gen(function* () {
      const resolvedPath = input.path ?? buildNamedWorktreePath(input.cwd, input.name);
      return yield* gitCore.createWorktree({
        cwd: input.cwd,
        branch: input.baseBranch,
        newBranch: input.name,
        path: resolvedPath,
      });
    });

  const stashWorkingTree = (cwd: string, label: string) =>
    Effect.gen(function* () {
      if (!(yield* gitCore.statusDetails(cwd)).hasWorkingTreeChanges) {
        return {
          hadChanges: false,
          stashRef: null,
        };
      }
      const beforeRef = yield* readStashRef(cwd);
      yield* gitCore.execute({
        operation: "GitManager.handoffThread.stashPush",
        cwd,
        args: ["stash", "push", "--include-untracked", "-m", label],
        timeoutMs: 30_000,
      });
      const afterRef = yield* readStashRef(cwd);
      if (afterRef === beforeRef) {
        return yield* gitManagerError(
          "handoffThread",
          "Git did not create a stash entry while preparing the thread handoff.",
        );
      }
      return {
        hadChanges: true,
        stashRef: afterRef,
      };
    });

  const dropStashBySha = (cwd: string, stashSha: string) =>
    Effect.gen(function* () {
      const listResult = yield* gitCore.execute({
        operation: "GitManager.handoffThread.listStashShas",
        cwd,
        args: ["stash", "list", "--format=%H"],
        allowNonZeroExit: true,
        timeoutMs: 5_000,
      });
      if (listResult.code !== 0) return;
      const index = listResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .indexOf(stashSha);
      if (index < 0) return;
      yield* gitCore.execute({
        operation: "GitManager.handoffThread.stashDrop",
        cwd,
        args: ["stash", "drop", `stash@{${index}}`],
        allowNonZeroExit: true,
        timeoutMs: 10_000,
      });
    });

  const popStash = (cwd: string, stashRef: string | null) =>
    Effect.gen(function* () {
      if (!stashRef) {
        return {
          conflictsDetected: false,
          message: null as string | null,
        };
      }
      // `git stash pop` requires a `stash@{N}` reference, but `stashRef` here is the
      // commit SHA captured via `git rev-parse refs/stash` in `readStashRef`. Apply
      // the stash by SHA (which `git stash apply` accepts for any stash-shaped
      // commit) and then drop the matching list entry on success so callers still
      // observe pop-style semantics.
      const result = yield* gitCore
        .execute({
          operation: "GitManager.handoffThread.stashApply",
          cwd,
          args: ["stash", "apply", "--index", stashRef],
          allowNonZeroExit: true,
          timeoutMs: 30_000,
        })
        .pipe(
          Effect.catch((error) =>
            Effect.succeed({
              code: 1,
              stdout: "",
              stderr: error instanceof Error ? error.message : String(error),
              stdoutTruncated: false,
              stderrTruncated: false,
            }),
          ),
        );
      if (result.code === 0) {
        yield* dropStashBySha(cwd, stashRef).pipe(Effect.catch(() => Effect.void));
        return {
          conflictsDetected: false,
          message: null as string | null,
        };
      }
      return {
        conflictsDetected: true,
        message: (combineGitMessages(result.stdout, result.stderr) ??
          "Git reported conflicts while applying the handed off changes.") as string | null,
      };
    });

  const restoreSourceStash = (cwd: string, stashRef: string | null) =>
    popStash(cwd, stashRef).pipe(Effect.asVoid);

  const restoreStashes = (restores: ReadonlyArray<{ cwd: string; stashRef: string | null }>) =>
    Effect.forEach(restores, (entry) => restoreSourceStash(entry.cwd, entry.stashRef), {
      concurrency: 1,
      discard: true,
    });

  const resolveForegroundFallbackBranch = (cwd: string, excludedBranch: string) =>
    gitCore.listBranches({ cwd }).pipe(
      Effect.map((result) => {
        const localBranches = result.branches.filter(
          (branch) =>
            !branch.isRemote && branch.name !== excludedBranch && branch.worktreePath === null,
        );
        const defaultBranch = localBranches.find((branch) => branch.isDefault)?.name ?? null;
        if (defaultBranch) return defaultBranch;
        return localBranches[0]?.name ?? null;
      }),
    );

  const restoreLocalHandoffSource = (input: {
    cwd: string;
    originalBranch: string | null;
    originalHeadRef: string | null;
    currentBranch: string | null;
    stashRef: string | null;
  }) =>
    Effect.gen(function* () {
      let checkoutRestored = input.originalBranch === input.currentBranch;
      const recoveryNotes: string[] = [];

      if (
        input.originalBranch &&
        input.currentBranch &&
        input.originalBranch !== input.currentBranch
      ) {
        checkoutRestored = yield* Effect.scoped(
          gitCore.checkoutBranch({
            cwd: input.cwd,
            branch: input.originalBranch,
          }),
        ).pipe(
          Effect.as(true),
          Effect.catch((error) => {
            recoveryNotes.push(
              `Local could not be returned to '${input.originalBranch}': ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return Effect.succeed(false);
          }),
        );
      } else if (!input.originalBranch && input.originalHeadRef) {
        checkoutRestored = yield* checkoutDetached(input.cwd, input.originalHeadRef).pipe(
          Effect.as(true),
          Effect.catch((error) => {
            recoveryNotes.push(
              `Local could not be returned to its previous detached HEAD: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return Effect.succeed(false);
          }),
        );
      }

      const stashRestore = yield* popStash(input.cwd, input.stashRef);
      const stashRestored = !stashRestore.conflictsDetected;
      if (stashRestore.conflictsDetected) {
        recoveryNotes.push(
          `${stashRestore.message ?? "Git reported conflicts while restoring the original Local changes."}\nThe local stash entry was kept for recovery.`,
        );
      }

      return {
        checkoutRestored,
        stashRestored,
        recoveryNotes,
      };
    });

  const restoreRemovedWorktreeAfterFailedLocalCheckout = (input: {
    cwd: string;
    worktreePath: string | null;
    branch: string | null;
    ref: string | null;
    worktreeStashRef: string | null;
    localStashRef: string | null;
  }) =>
    Effect.gen(function* () {
      const recoveryNotes: string[] = [];
      let worktreeRecreated = false;
      let worktreeChangesRestored = input.worktreeStashRef === null;
      let localChangesRestored = input.localStashRef === null;

      if (input.worktreePath) {
        const recreated =
          input.branch !== null
            ? yield* gitCore
                .createWorktree({
                  cwd: input.cwd,
                  branch: input.branch,
                  path: input.worktreePath,
                })
                .pipe(Effect.catch(() => Effect.succeed(null)))
            : input.ref
              ? yield* createDetachedWorktree({
                  cwd: input.cwd,
                  ref: input.ref,
                  path: input.worktreePath,
                }).pipe(Effect.catch(() => Effect.succeed(null)))
              : null;

        if (recreated?.worktree.path) {
          worktreeRecreated = true;
          const worktreeRestore = yield* popStash(recreated.worktree.path, input.worktreeStashRef);
          worktreeChangesRestored = !worktreeRestore.conflictsDetected;
          if (worktreeRestore.conflictsDetected) {
            recoveryNotes.push(
              `${worktreeRestore.message ?? "Git reported conflicts while restoring the recovered worktree changes."}\nThe worktree stash entry was kept for recovery.`,
            );
          }
        } else if (input.worktreeStashRef) {
          recoveryNotes.push(
            "The thread worktree could not be recreated automatically. Its uncommitted changes were kept in the Git stash for manual recovery.",
          );
        }
      }

      const localRestore = yield* popStash(input.cwd, input.localStashRef);
      localChangesRestored = !localRestore.conflictsDetected;
      if (localRestore.conflictsDetected) {
        recoveryNotes.push(
          `${localRestore.message ?? "Git reported conflicts while restoring your previous local changes."}\nThe local stash entry was kept for recovery.`,
        );
      }

      return {
        worktreeRecreated,
        worktreeChangesRestored,
        localChangesRestored,
        recoveryNotes,
      };
    });

  const rollbackFailedLocalTransfer = (input: {
    cwd: string;
    originalBranch: string | null;
    originalHeadRef: string | null;
    currentBranch: string | null;
    worktreePath: string | null;
    worktreeBranch: string | null;
    worktreeRef: string | null;
    worktreeStashRef: string | null;
    localStashRef: string | null;
  }) =>
    Effect.gen(function* () {
      const worktreeRecovery = yield* restoreRemovedWorktreeAfterFailedLocalCheckout({
        cwd: input.cwd,
        worktreePath: input.worktreePath,
        branch: input.worktreeBranch,
        ref: input.worktreeRef,
        worktreeStashRef: input.worktreeStashRef,
        localStashRef: null,
      });

      const localRecovery = yield* restoreLocalHandoffSource({
        cwd: input.cwd,
        originalBranch: input.originalBranch,
        originalHeadRef: input.originalHeadRef,
        currentBranch: input.currentBranch,
        stashRef: input.localStashRef,
      });

      return {
        worktreeRecreated: worktreeRecovery.worktreeRecreated,
        worktreeChangesRestored: worktreeRecovery.worktreeChangesRestored,
        localCheckoutRestored: localRecovery.checkoutRestored,
        localChangesRestored: localRecovery.stashRestored,
        recoveryNotes: [...worktreeRecovery.recoveryNotes, ...localRecovery.recoveryNotes],
      };
    });

  const rollbackFailedWorktreeTransfer = (input: {
    cwd: string;
    worktreePath: string;
    originalBranch: string | null;
    originalHeadRef: string | null;
    currentBranch: string | null;
    stashRef: string | null;
  }) =>
    Effect.gen(function* () {
      const recoveryNotes: string[] = [];
      const worktreeRemoved = yield* gitCore
        .removeWorktree({
          cwd: input.cwd,
          path: input.worktreePath,
          force: true,
        })
        .pipe(
          Effect.as(true),
          Effect.catch((error) => {
            recoveryNotes.push(
              `The newly created worktree could not be removed automatically: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return Effect.succeed(false);
          }),
        );

      const localRecovery = yield* restoreLocalHandoffSource({
        cwd: input.cwd,
        originalBranch: input.originalBranch,
        originalHeadRef: input.originalHeadRef,
        currentBranch: input.currentBranch,
        stashRef: input.stashRef,
      });

      return {
        worktreeRemoved,
        checkoutRestored: localRecovery.checkoutRestored,
        stashRestored: localRecovery.stashRestored,
        recoveryNotes: [...recoveryNotes, ...localRecovery.recoveryNotes],
      };
    });

  const handoffThread: GitManagerShape["handoffThread"] = Effect.fnUntraced(function* (input) {
    const currentLocalStatus = yield* gitCore.statusDetails(input.cwd);

    if (input.targetMode === "local") {
      if (!input.worktreePath) {
        return yield* gitManagerError(
          "handoffThread",
          "Cannot hand off to Local because this thread does not have a materialized worktree.",
        );
      }

      const worktreeHeadRef = yield* readHeadRef(input.worktreePath);
      const targetLocalBranch =
        input.currentBranch ?? input.associatedWorktreeBranch ?? input.preferredLocalBranch ?? null;
      if (!(targetLocalBranch ?? worktreeHeadRef)) {
        return yield* gitManagerError(
          "handoffThread",
          "Cannot hand off to Local because the worktree thread does not have a recoverable HEAD reference.",
        );
      }

      const associatedWorktreePath = input.associatedWorktreePath ?? input.worktreePath;
      const associatedWorktreeBranch =
        input.associatedWorktreeBranch ?? input.currentBranch ?? null;
      const associatedWorktreeRef =
        input.associatedWorktreeRef ?? worktreeHeadRef ?? associatedWorktreeBranch;
      const originalLocalBranch = currentLocalStatus.branch ?? null;
      const originalLocalHeadRef = yield* readHeadRef(input.cwd);
      let currentLocalBranchAfterPreparation = originalLocalBranch;

      const preservedLocalStash = yield* stashWorkingTree(
        input.cwd,
        `marcode preserve local handoff ${randomUUID()}`,
      );
      const sourceStash = yield* stashWorkingTree(
        input.worktreePath,
        `marcode handoff to local ${randomUUID()}`,
      );

      yield* gitCore
        .removeWorktree({
          cwd: input.cwd,
          path: input.worktreePath,
        })
        .pipe(
          Effect.catch((error) =>
            restoreStashes([
              { cwd: input.worktreePath!, stashRef: sourceStash.stashRef },
              { cwd: input.cwd, stashRef: preservedLocalStash.stashRef },
            ]).pipe(Effect.flatMap(() => Effect.fail(error))),
          ),
        );

      if (targetLocalBranch && currentLocalStatus.branch !== targetLocalBranch) {
        yield* Effect.scoped(
          gitCore.checkoutBranch({
            cwd: input.cwd,
            branch: targetLocalBranch,
          }),
        ).pipe(
          Effect.catch((error) =>
            restoreRemovedWorktreeAfterFailedLocalCheckout({
              cwd: input.cwd,
              worktreePath: associatedWorktreePath,
              branch: associatedWorktreeBranch,
              ref: associatedWorktreeRef,
              worktreeStashRef: sourceStash.stashRef,
              localStashRef: preservedLocalStash.stashRef,
            }).pipe(
              Effect.flatMap((recovery) =>
                Effect.fail(
                  new GitManagerError({
                    operation: "GitManager.handoffThread",
                    detail: buildFailedLocalHandoffRecoveryDetail(error.message, recovery),
                    cause: error,
                  }),
                ),
              ),
            ),
          ),
        );
        currentLocalBranchAfterPreparation = targetLocalBranch;
      } else if (!targetLocalBranch && worktreeHeadRef) {
        yield* checkoutDetached(input.cwd, worktreeHeadRef).pipe(
          Effect.catch((error) =>
            restoreRemovedWorktreeAfterFailedLocalCheckout({
              cwd: input.cwd,
              worktreePath: associatedWorktreePath,
              branch: associatedWorktreeBranch,
              ref: associatedWorktreeRef,
              worktreeStashRef: sourceStash.stashRef,
              localStashRef: preservedLocalStash.stashRef,
            }).pipe(
              Effect.flatMap((recovery) =>
                Effect.fail(
                  new GitManagerError({
                    operation: "GitManager.handoffThread",
                    detail: buildFailedLocalHandoffRecoveryDetail(error.message, recovery),
                    cause: error,
                  }),
                ),
              ),
            ),
          ),
        );
        currentLocalBranchAfterPreparation = null;
      }

      const threadTransfer = yield* popStash(input.cwd, sourceStash.stashRef);
      if (threadTransfer.conflictsDetected) {
        const recovery = yield* rollbackFailedLocalTransfer({
          cwd: input.cwd,
          originalBranch: originalLocalBranch,
          originalHeadRef: originalLocalHeadRef,
          currentBranch: currentLocalBranchAfterPreparation,
          worktreePath: associatedWorktreePath,
          worktreeBranch: associatedWorktreeBranch,
          worktreeRef: associatedWorktreeRef,
          worktreeStashRef: sourceStash.stashRef,
          localStashRef: preservedLocalStash.stashRef,
        });
        return yield* new GitManagerError({
          operation: "GitManager.handoffThread",
          detail: buildFailedLocalTransferDetail(
            `${
              threadTransfer.message ??
              "Git reported conflicts while applying the handed off changes."
            } The handoff was rolled back so the thread stays in its worktree.`,
            recovery,
          ),
        });
      }

      const localTransfer = yield* popStash(input.cwd, preservedLocalStash.stashRef);
      const changesTransferred = sourceStash.hadChanges || preservedLocalStash.hadChanges;
      const movedThreadChanges = sourceStash.hadChanges;
      const restoredLocalChanges = preservedLocalStash.hadChanges;
      const localTargetLabel = targetLocalBranch
        ? `main local checkout on '${targetLocalBranch}'`
        : "local checkout in detached HEAD";
      const message = localTransfer.conflictsDetected
        ? `${
            localTransfer.message ??
            "Git reported conflicts while restoring your previous local changes."
          }\nYour previous local stash entry was kept for recovery.`
        : movedThreadChanges && restoredLocalChanges
          ? `Moved the thread back to the ${localTargetLabel}, carried its uncommitted work over, and restored your previous local changes.`
          : movedThreadChanges
            ? `Moved the thread back to the ${localTargetLabel} and carried its uncommitted work over.`
            : restoredLocalChanges
              ? `Moved the thread back to the ${localTargetLabel} and restored your previous local changes.`
              : `Moved the thread back to the ${localTargetLabel}.`;

      return {
        targetMode: "local",
        branch: targetLocalBranch,
        worktreePath: null,
        associatedWorktreePath,
        associatedWorktreeBranch,
        associatedWorktreeRef,
        changesTransferred,
        conflictsDetected: localTransfer.conflictsDetected,
        message,
      };
    }

    const worktreeIntent = resolveWorktreeHandoffIntent({
      preferredNewWorktreeName: input.preferredNewWorktreeName,
      associatedWorktreePath: input.associatedWorktreePath,
      associatedWorktreeBranch: input.associatedWorktreeBranch,
      associatedWorktreeRef: input.associatedWorktreeRef,
      preferredWorktreeBaseBranch:
        input.preferredWorktreeBaseBranch ?? currentLocalStatus.branch ?? null,
      currentBranch: input.currentBranch,
    });
    if (!worktreeIntent) {
      return yield* gitManagerError(
        "handoffThread",
        "Cannot hand off to a worktree because no worktree target is available.",
      );
    }
    const targetWorktreeName =
      worktreeIntent.kind === "create-new" ? worktreeIntent.worktreeName : null;
    const targetAssociatedWorktreePath =
      worktreeIntent.kind === "reuse-associated" ? worktreeIntent.associatedWorktreePath : null;
    const targetAssociatedWorktreeBranch =
      worktreeIntent.kind === "reuse-associated" ? worktreeIntent.associatedWorktreeBranch : null;
    const targetAssociatedWorktreeRef =
      worktreeIntent.kind === "reuse-associated" ? worktreeIntent.associatedWorktreeRef : null;
    const targetBaseBranch = worktreeIntent.baseBranch;
    if (!targetBaseBranch && !targetAssociatedWorktreeBranch && !targetAssociatedWorktreeRef) {
      return yield* gitManagerError(
        "handoffThread",
        "Select a base branch before handing off this thread to a worktree.",
      );
    }

    const sourceStash = yield* stashWorkingTree(
      input.cwd,
      `marcode handoff to worktree ${randomUUID()}`,
    );
    const sourceBranch = currentLocalStatus.branch ?? input.currentBranch ?? null;
    const sourceHeadRef = yield* readHeadRef(input.cwd);
    let foregroundBranchAfterHandoff = currentLocalStatus.branch;

    if (sourceBranch && sourceBranch === targetAssociatedWorktreeBranch) {
      const fallbackLocalBranch = yield* resolveForegroundFallbackBranch(
        input.cwd,
        targetAssociatedWorktreeBranch,
      );
      if (!fallbackLocalBranch) {
        if (!sourceHeadRef) {
          yield* restoreSourceStash(input.cwd, sourceStash.stashRef);
          return yield* gitManagerError(
            "handoffThread",
            `Cannot hand off '${targetAssociatedWorktreeBranch}' to a worktree because there is no recoverable local HEAD reference available.`,
          );
        }
        yield* checkoutDetached(input.cwd, sourceHeadRef).pipe(
          Effect.catch((error) =>
            restoreSourceStash(input.cwd, sourceStash.stashRef).pipe(
              Effect.flatMap(() => Effect.fail(error)),
            ),
          ),
        );
        foregroundBranchAfterHandoff = null;
      } else {
        yield* Effect.scoped(
          gitCore.checkoutBranch({
            cwd: input.cwd,
            branch: fallbackLocalBranch,
          }),
        ).pipe(
          Effect.catch((error) =>
            restoreSourceStash(input.cwd, sourceStash.stashRef).pipe(
              Effect.flatMap(() => Effect.fail(error)),
            ),
          ),
        );
        foregroundBranchAfterHandoff = fallbackLocalBranch;
      }
    }

    const worktree = yield* Effect.gen(function* () {
      if (targetAssociatedWorktreeRef && !targetAssociatedWorktreeBranch) {
        return yield* createDetachedWorktree({
          cwd: input.cwd,
          ref: targetAssociatedWorktreeRef,
          path: targetAssociatedWorktreePath,
        });
      }
      if (targetWorktreeName) {
        if (!targetBaseBranch) {
          return yield* gitManagerError(
            "handoffThread",
            "Select a base branch before creating a new worktree.",
          );
        }
        return yield* createNamedWorktree({
          cwd: input.cwd,
          baseBranch: targetBaseBranch,
          name: targetWorktreeName,
          path: null,
        });
      }
      if (targetAssociatedWorktreeBranch) {
        if (
          (yield* gitCore.listLocalBranchNames(input.cwd)).includes(targetAssociatedWorktreeBranch)
        ) {
          return yield* gitCore.createWorktree({
            cwd: input.cwd,
            branch: targetAssociatedWorktreeBranch,
            path: targetAssociatedWorktreePath,
          });
        }
        if (!targetBaseBranch) {
          return yield* createDetachedWorktree({
            cwd: input.cwd,
            ref: targetAssociatedWorktreeBranch,
            path: targetAssociatedWorktreePath,
          });
        }
        return yield* gitCore.createWorktree({
          cwd: input.cwd,
          branch: targetBaseBranch ?? targetAssociatedWorktreeBranch,
          newBranch: targetAssociatedWorktreeBranch,
          path: targetAssociatedWorktreePath,
        });
      }
      if (!targetBaseBranch) {
        return yield* createDetachedWorktree({
          cwd: input.cwd,
          ref: targetAssociatedWorktreeRef!,
          path: targetAssociatedWorktreePath,
        });
      }
      return yield* createDetachedWorktree({
        cwd: input.cwd,
        ref: targetBaseBranch,
        path: targetAssociatedWorktreePath,
        ...(targetWorktreeName ? { name: targetWorktreeName } : {}),
      });
    }).pipe(
      Effect.catch((error) =>
        restoreLocalHandoffSource({
          cwd: input.cwd,
          originalBranch: sourceBranch,
          originalHeadRef: sourceHeadRef,
          currentBranch: foregroundBranchAfterHandoff,
          stashRef: sourceStash.stashRef,
        }).pipe(
          Effect.flatMap((recovery) =>
            Effect.fail(
              new GitManagerError({
                operation: "GitManager.handoffThread",
                detail: buildFailedWorktreeHandoffRecoveryDetail(error.message, recovery),
                cause: error,
              }),
            ),
          ),
        ),
      ),
    );

    const transfer = yield* popStash(worktree.worktree.path, sourceStash.stashRef);
    if (transfer.conflictsDetected) {
      const recovery = yield* rollbackFailedWorktreeTransfer({
        cwd: input.cwd,
        worktreePath: worktree.worktree.path,
        originalBranch: sourceBranch,
        originalHeadRef: sourceHeadRef,
        currentBranch: foregroundBranchAfterHandoff,
        stashRef: sourceStash.stashRef,
      });
      return yield* new GitManagerError({
        operation: "GitManager.handoffThread",
        detail: buildFailedWorktreeTransferDetail(
          `${
            transfer.message ?? "Git reported conflicts while applying the handed off changes."
          } The stash entry was kept for recovery.`,
          recovery,
        ),
      });
    }

    const materializedWorktreeStatus = yield* gitCore.statusDetails(worktree.worktree.path);
    const materializedWorktreeRef =
      (yield* readHeadRef(worktree.worktree.path)) ??
      ("ref" in worktree.worktree ? worktree.worktree.ref : worktree.worktree.branch);
    const materializedWorktreeBranch = materializedWorktreeStatus.branch ?? null;
    // MarCode does not expose `gitCore.publishBranch`. Worktree branch publishing is
    // skipped here; remote-set behavior remains a best-effort responsibility of any
    // explicit push action initiated after the handoff.
    const changesTransferred = sourceStash.hadChanges;
    const handoffSummary =
      foregroundBranchAfterHandoff && foregroundBranchAfterHandoff !== sourceBranch
        ? `The thread moved into its worktree and Local returned to '${foregroundBranchAfterHandoff}'.`
        : foregroundBranchAfterHandoff === null && sourceBranch === targetAssociatedWorktreeBranch
          ? "The thread moved into its worktree and Local returned to a detached HEAD."
          : "The thread moved into its worktree.";
    const message = changesTransferred
      ? `${handoffSummary} Uncommitted local changes were carried over.`
      : handoffSummary;

    return {
      targetMode: "worktree",
      branch: materializedWorktreeBranch,
      worktreePath: worktree.worktree.path,
      associatedWorktreePath: worktree.worktree.path,
      associatedWorktreeBranch: materializedWorktreeBranch,
      associatedWorktreeRef: materializedWorktreeRef,
      changesTransferred,
      conflictsDetected: false,
      message,
    };
  });

  const runFeatureBranchStep = Effect.fn("runFeatureBranchStep")(function* (
    modelSelection: ModelSelection,
    cwd: string,
    branch: string | null,
    commitMessage?: string,
    filePaths?: readonly string[],
    jiraTickets?: ReadonlyArray<JiraTicketContext>,
  ) {
    const suggestion = yield* resolveCommitAndBranchSuggestion({
      cwd,
      branch,
      ...(commitMessage ? { commitMessage } : {}),
      ...(filePaths ? { filePaths } : {}),
      includeBranch: true,
      modelSelection,
      ...(jiraTickets && jiraTickets.length > 0 ? { jiraTickets } : {}),
    });
    if (!suggestion) {
      return yield* gitManagerError(
        "runFeatureBranchStep",
        "Cannot create a feature branch because there are no changes to commit.",
      );
    }

    const preferredBranch = suggestion.branch ?? sanitizeFeatureBranchName(suggestion.subject);
    const existingBranchNames = yield* gitCore.listLocalBranchNames(cwd);
    const resolvedBranch = resolveAutoFeatureBranchName(existingBranchNames, preferredBranch);

    yield* gitCore.createBranch({ cwd, branch: resolvedBranch });
    yield* Effect.scoped(gitCore.checkoutBranch({ cwd, branch: resolvedBranch }));

    return {
      branchStep: { status: "created" as const, name: resolvedBranch },
      resolvedCommitMessage: suggestion.commitMessage,
      resolvedCommitSuggestion: suggestion,
    };
  });

  const runStackedAction: GitManagerShape["runStackedAction"] = Effect.fn("runStackedAction")(
    function* (input, options) {
      const progress = createProgressEmitter(input, options);
      const currentPhase = yield* Ref.make<Option.Option<GitActionProgressPhase>>(Option.none());

      const runAction = Effect.fn("runStackedAction.runAction")(function* (): Effect.fn.Return<
        GitRunStackedActionResult,
        GitManagerServiceError
      > {
        const initialStatus = yield* gitCore.statusDetails(input.cwd);
        const wantsCommit = isCommitAction(input.action);
        const wantsPush =
          input.action === "push" ||
          input.action === "commit_push" ||
          input.action === "commit_push_pr" ||
          (input.action === "create_pr" &&
            (!initialStatus.hasUpstream || initialStatus.aheadCount > 0));
        const wantsPr = input.action === "create_pr" || input.action === "commit_push_pr";

        if (input.featureBranch && !wantsCommit) {
          return yield* gitManagerError(
            "runStackedAction",
            "Feature-branch checkout is only supported for commit actions.",
          );
        }
        if (input.action === "push" && initialStatus.hasWorkingTreeChanges) {
          return yield* gitManagerError(
            "runStackedAction",
            "Commit or stash local changes before pushing.",
          );
        }
        if (input.action === "create_pr" && initialStatus.hasWorkingTreeChanges) {
          return yield* gitManagerError(
            "runStackedAction",
            "Commit local changes before creating a PR.",
          );
        }

        const phases: GitActionProgressPhase[] = [
          ...(input.featureBranch ? (["branch"] as const) : []),
          ...(wantsCommit ? (["commit"] as const) : []),
          ...(wantsPush ? (["push"] as const) : []),
          ...(wantsPr ? (["pr"] as const) : []),
        ];

        yield* progress.emit({
          kind: "action_started",
          phases,
        });

        if (!input.featureBranch && wantsPush && !initialStatus.branch) {
          return yield* gitManagerError("runStackedAction", "Cannot push from detached HEAD.");
        }
        if (!input.featureBranch && wantsPr && !initialStatus.branch) {
          return yield* gitManagerError(
            "runStackedAction",
            "Cannot create a pull request from detached HEAD.",
          );
        }

        let branchStep: { status: "created" | "skipped_not_requested"; name?: string };
        let commitMessageForStep = input.commitMessage;
        let preResolvedCommitSuggestion: CommitAndBranchSuggestion | undefined = undefined;

        const modelSelection = yield* serverSettingsService.getSettings.pipe(
          Effect.map((settings) => settings.textGenerationModelSelection),
          Effect.mapError((cause) =>
            gitManagerError("runStackedAction", "Failed to get server settings.", cause),
          ),
        );

        const jiraTickets = yield* resolveJiraTickets(input.threadId);

        if (input.featureBranch) {
          yield* Ref.set(currentPhase, Option.some("branch"));
          yield* progress.emit({
            kind: "phase_started",
            phase: "branch",
            label: "Preparing feature branch...",
          });
          const result = yield* runFeatureBranchStep(
            modelSelection,
            input.cwd,
            initialStatus.branch,
            input.commitMessage,
            input.filePaths,
            jiraTickets,
          );
          branchStep = result.branchStep;
          commitMessageForStep = result.resolvedCommitMessage;
          preResolvedCommitSuggestion = result.resolvedCommitSuggestion;
        } else {
          branchStep = { status: "skipped_not_requested" as const };
        }

        const currentBranch = branchStep.name ?? initialStatus.branch;
        const commitAction = isCommitAction(input.action) ? input.action : null;

        const commit = commitAction
          ? yield* Ref.set(currentPhase, Option.some("commit")).pipe(
              Effect.flatMap(() =>
                runCommitStep(
                  modelSelection,
                  input.cwd,
                  commitAction,
                  currentBranch,
                  commitMessageForStep,
                  preResolvedCommitSuggestion,
                  input.filePaths,
                  options?.progressReporter,
                  progress.actionId,
                  jiraTickets,
                ),
              ),
            )
          : { status: "skipped_not_requested" as const };

        const push = wantsPush
          ? yield* progress
              .emit({
                kind: "phase_started",
                phase: "push",
                label: "Pushing...",
              })
              .pipe(
                Effect.tap(() => Ref.set(currentPhase, Option.some("push"))),
                Effect.flatMap(() => gitCore.pushCurrentBranch(input.cwd, currentBranch)),
              )
          : { status: "skipped_not_requested" as const };

        const pr = wantsPr
          ? yield* Effect.gen(function* () {
              const hostProvider = yield* detectHostProvider(input.cwd).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
              );
              const prOrMr = hostProvider === "gitlab" ? "MR" : "PR";
              yield* progress.emit({
                kind: "phase_started",
                phase: "pr",
                label: `Preparing ${prOrMr}...`,
              });
              yield* Ref.set(currentPhase, Option.some("pr"));
              return yield* runPrStep(
                modelSelection,
                input.cwd,
                currentBranch,
                progress.emit,
                jiraTickets,
              );
            })
          : { status: "skipped_not_requested" as const };

        const toast = yield* buildCompletionToast(input.cwd, {
          action: input.action,
          branch: branchStep,
          commit,
          push,
          pr,
        });

        const result = {
          action: input.action,
          branch: branchStep,
          commit,
          push,
          pr,
          toast,
        };
        yield* progress.emit({
          kind: "action_finished",
          result,
        });
        return result;
      });

      return yield* runAction().pipe(
        Effect.ensuring(invalidateStatus(input.cwd)),
        Effect.tapError((error) =>
          Effect.flatMap(Ref.get(currentPhase), (phase) =>
            progress.emit({
              kind: "action_failed",
              phase: Option.getOrNull(phase),
              message: error.message,
            }),
          ),
        ),
      );
    },
  );

  return {
    localStatus,
    remoteStatus,
    status,
    invalidateLocalStatus,
    invalidateRemoteStatus,
    invalidateStatus,
    resolvePullRequest,
    preparePullRequestThread,
    handoffThread,
    runStackedAction,
  } satisfies GitManagerShape;
});

export const GitManagerLive = Layer.effect(GitManager, makeGitManager());
