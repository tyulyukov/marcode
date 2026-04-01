import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

import { Duration, Effect, Layer, Option, Ref, Schedule, Schema } from "effect";
import {
  GitActionProgressEvent,
  GitActionProgressPhase,
  GitRunStackedActionResult,
  ModelSelection,
} from "@marcode/contracts";
import type { GitHostProvider } from "@marcode/contracts";
import {
  resolveAutoFeatureBranchName,
  sanitizeBranchFragment,
  sanitizeFeatureBranchName,
} from "@marcode/shared/git";

import { GitHostCliError, GitManagerError } from "../Errors.ts";
import {
  GitManager,
  type GitActionProgressReporter,
  type GitManagerShape,
  type GitRunStackedActionOptions,
} from "../Services/GitManager.ts";
import { GitCore } from "../Services/GitCore.ts";
import { GitHostCli } from "../Services/GitHostCli.ts";
import { TextGeneration } from "../Services/TextGeneration.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import type { GitManagerServiceError } from "../Errors.ts";

const COMMIT_TIMEOUT_MS = 10 * 60_000;
const MAX_PROGRESS_TEXT_LENGTH = 500;

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

interface OpenPrInfo {
  number: number;
  title: string;
  url: string;
  baseRefName: string;
  headRefName: string;
}

interface PullRequestInfo extends OpenPrInfo {
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

function gitManagerError(operation: string, detail: string, cause?: unknown): GitManagerError {
  return new GitManagerError({
    operation,
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function limitContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated]`;
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

function extractBranchFromRef(ref: string): string {
  const normalized = ref.trim();

  if (normalized.startsWith("refs/remotes/")) {
    const withoutPrefix = normalized.slice("refs/remotes/".length);
    const firstSlash = withoutPrefix.indexOf("/");
    if (firstSlash === -1) {
      return withoutPrefix.trim();
    }
    return withoutPrefix.slice(firstSlash + 1).trim();
  }

  const firstSlash = normalized.indexOf("/");
  if (firstSlash === -1) {
    return normalized;
  }
  return normalized.slice(firstSlash + 1).trim();
}

function appendUnique(values: string[], next: string | null | undefined): void {
  const trimmed = next?.trim() ?? "";
  if (trimmed.length === 0 || values.includes(trimmed)) {
    return;
  }
  values.push(trimmed);
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
  const serverSettingsService = yield* ServerSettingsService;

  const createProgressEmitter = (
    input: { cwd: string; action: "commit" | "commit_push" | "commit_push_pr" },
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

  const resolveRefspecPrefix = (cwd: string) => {
    if (gitHostCli.pullRequestRefspecPrefixForCwd) {
      return gitHostCli
        .pullRequestRefspecPrefixForCwd({ cwd })
        .pipe(Effect.catch(() => Effect.succeed(gitHostCli.pullRequestRefspecPrefix())));
    }
    return Effect.succeed(gitHostCli.pullRequestRefspecPrefix());
  };

  const materializePullRequestHeadBranchBase = Effect.fn("materializePullRequestHeadBranch")(
    function* (
      cwd: string,
      pullRequest: ResolvedPullRequest & PullRequestHeadRemoteInfo,
      localBranch = pullRequest.headBranch,
    ) {
      const repositoryNameWithOwner = resolveHeadRepositoryNameWithOwner(pullRequest) ?? "";

      if (repositoryNameWithOwner.length === 0) {
        const refspecPrefix = yield* resolveRefspecPrefix(cwd);
        yield* gitCore.fetchPullRequestBranch({
          cwd,
          prNumber: pullRequest.number,
          branch: localBranch,
          refspecPrefix,
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
        Effect.gen(function* () {
          const refspecPrefix = yield* resolveRefspecPrefix(cwd);
          yield* gitCore.fetchPullRequestBranch({
            cwd,
            prNumber: pullRequest.number,
            branch: localBranch,
            refspecPrefix,
          });
        }),
      ),
    );

  const readConfigValueNullable = (cwd: string, key: string) =>
    gitCore.readConfigValue(cwd, key).pipe(Effect.catch(() => Effect.succeed(null)));

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
      ? extractBranchFromRef(details.upstreamRef)
      : "";
    const headBranch = headBranchFromUpstream.length > 0 ? headBranchFromUpstream : details.branch;

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
    appendUnique(headSelectors, details.branch);
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

  const findOpenPr = Effect.fn("findOpenPr")(function* (
    cwd: string,
    headSelectors: ReadonlyArray<string>,
    originRepo?: string | null,
  ) {
    for (const headSelector of headSelectors) {
      const pullRequests = yield* gitHostCli.listPullRequests({
        cwd,
        headSelector,
        state: "open",
        limit: 1,
        ...(originRepo ? { repo: originRepo } : {}),
      });

      const [firstPullRequest] = pullRequests;
      if (firstPullRequest) {
        return {
          number: firstPullRequest.number,
          title: firstPullRequest.title,
          url: firstPullRequest.url,
          baseRefName: firstPullRequest.baseRefName,
          headRefName: firstPullRequest.headRefName,
          state: "open",
          updatedAt: firstPullRequest.updatedAt ?? null,
        } satisfies PullRequestInfo;
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
        });
      }
    }

    const parsed = Array.from(parsedByNumber.values()).toSorted((a, b) => {
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

  const resolveBaseBranch = Effect.fn("resolveBaseBranch")(function* (
    cwd: string,
    branch: string,
    upstreamRef: string | null,
    headContext: Pick<BranchHeadContext, "isCrossRepository">,
  ) {
    const configured = yield* gitCore.readConfigValue(cwd, `branch.${branch}.gh-merge-base`);
    if (configured) return configured;

    if (upstreamRef && !headContext.isCrossRepository) {
      const upstreamBranch = extractBranchFromRef(upstreamRef);
      if (upstreamBranch.length > 0 && upstreamBranch !== branch) {
        return upstreamBranch;
      }
    }

    const defaultBranch = yield* gitHostCli
      .getDefaultBranch({ cwd })
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (defaultBranch) {
      return defaultBranch;
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

    const existing = yield* findOpenPr(
      cwd,
      headContext.headSelectors,
      headContext.originRepositoryNameWithOwner,
    );
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
    const rangeContext = yield* gitCore.readRangeContext(cwd, baseBranch);

    const generated = yield* textGeneration.generatePrContent({
      cwd,
      baseBranch,
      headBranch: headContext.headBranch,
      commitSummary: limitContext(rangeContext.commitSummary, 20_000),
      diffSummary: limitContext(rangeContext.diffSummary, 20_000),
      diffPatch: limitContext(rangeContext.diffPatch, 60_000),
      modelSelection,
    });

    yield* gitHostCli
      .createPullRequest({
        cwd,
        baseBranch,
        headSelector: headContext.preferredHeadSelector,
        title: generated.title,
        body: generated.body,
      })
      .pipe(
        Effect.retry({
          times: PR_CREATE_RETRY_ATTEMPTS,
          schedule: Schedule.exponential(PR_CREATE_RETRY_BASE_DELAY, 2),
          while: isBranchNotReadyError,
        }),
      );

    const created = yield* findOpenPr(
      cwd,
      headContext.headSelectors,
      headContext.originRepositoryNameWithOwner,
    );
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

  const resolveDetectedProvider = (cwd: string): Effect.Effect<GitHostProvider | undefined> => {
    if (gitHostCli.detectedProvider) {
      return gitHostCli
        .detectedProvider({ cwd })
        .pipe(
          Effect.catch((): Effect.Effect<GitHostProvider | undefined> => Effect.succeed(undefined)),
        );
    }
    return Effect.succeed(gitHostCli.provider as GitHostProvider | undefined);
  };

  const status: GitManagerShape["status"] = Effect.fn("status")(function* (input) {
    const details = yield* gitCore.statusDetails(input.cwd);

    const [pr, gitHostProvider] = yield* Effect.all(
      [
        details.branch !== null
          ? findLatestPr(input.cwd, {
              branch: details.branch,
              upstreamRef: details.upstreamRef,
            }).pipe(
              Effect.map((latest) => (latest ? toStatusPr(latest) : null)),
              Effect.catch(() => Effect.succeed(null)),
            )
          : Effect.succeed(null),
        resolveDetectedProvider(input.cwd),
      ],
      { concurrency: "unbounded" },
    );

    return {
      branch: details.branch,
      hasWorkingTreeChanges: details.hasWorkingTreeChanges,
      workingTree: details.workingTree,
      hasUpstream: details.hasUpstream,
      aheadCount: details.aheadCount,
      behindCount: details.behindCount,
      pr,
      ...(gitHostProvider ? { gitHostProvider } : {}),
    };
  });

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

    return {
      pullRequest,
      branch: worktree.worktree.branch,
      worktreePath: worktree.worktree.path,
    };
  });

  const runFeatureBranchStep = Effect.fn("runFeatureBranchStep")(function* (
    modelSelection: ModelSelection,
    cwd: string,
    branch: string | null,
    commitMessage?: string,
    filePaths?: readonly string[],
  ) {
    const suggestion = yield* resolveCommitAndBranchSuggestion({
      cwd,
      branch,
      ...(commitMessage ? { commitMessage } : {}),
      ...(filePaths ? { filePaths } : {}),
      includeBranch: true,
      modelSelection,
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
      const phases: GitActionProgressPhase[] = [
        ...(input.featureBranch ? (["branch"] as const) : []),
        "commit",
        ...(input.action !== "commit" ? (["push"] as const) : []),
        ...(input.action === "commit_push_pr" ? (["pr"] as const) : []),
      ];
      const currentPhase = yield* Ref.make<Option.Option<GitActionProgressPhase>>(Option.none());

      const runAction = Effect.fn("runStackedAction.runAction")(function* (): Effect.fn.Return<
        GitRunStackedActionResult,
        GitManagerServiceError
      > {
        yield* progress.emit({
          kind: "action_started",
          phases,
        });

        const wantsPush = input.action !== "commit";
        const wantsPr = input.action === "commit_push_pr";

        const initialStatus = yield* gitCore.statusDetails(input.cwd);
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
          );
          branchStep = result.branchStep;
          commitMessageForStep = result.resolvedCommitMessage;
          preResolvedCommitSuggestion = result.resolvedCommitSuggestion;
        } else {
          branchStep = { status: "skipped_not_requested" as const };
        }

        const currentBranch = branchStep.name ?? initialStatus.branch;

        yield* Ref.set(currentPhase, Option.some("commit"));
        const commit = yield* runCommitStep(
          modelSelection,
          input.cwd,
          input.action,
          currentBranch,
          commitMessageForStep,
          preResolvedCommitSuggestion,
          input.filePaths,
          options?.progressReporter,
          progress.actionId,
        );

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

        const detectedHostProvider = wantsPr
          ? yield* resolveDetectedProvider(input.cwd)
          : undefined;
        const prPhaseLabel =
          detectedHostProvider === "gitlab" ? "Creating MR..." : "Creating PR...";

        const pr = wantsPr
          ? yield* progress
              .emit({
                kind: "phase_started",
                phase: "pr",
                label: prPhaseLabel,
              })
              .pipe(
                Effect.tap(() => Ref.set(currentPhase, Option.some("pr"))),
                Effect.flatMap(() => runPrStep(modelSelection, input.cwd, currentBranch)),
              )
          : { status: "skipped_not_requested" as const };

        const result = {
          action: input.action,
          branch: branchStep,
          commit,
          push,
          pr,
        };
        yield* progress.emit({
          kind: "action_finished",
          result,
        });
        return result;
      });

      return yield* runAction().pipe(
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
    status,
    resolvePullRequest,
    preparePullRequestThread,
    runStackedAction,
  } satisfies GitManagerShape;
});

export const GitManagerLive = Layer.effect(GitManager, makeGitManager());
