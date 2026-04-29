import { describe, expect, it } from "vitest";

import {
  buildBranchNamePrompt,
  buildClassifyImplementingJiraTicketsPrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./Prompts.ts";
import {
  normalizeCliError,
  sanitizeCommitSubject,
  sanitizePrBody,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./Utils.ts";
import { TextGenerationError } from "@marcode/contracts";

describe("buildCommitMessagePrompt", () => {
  it("includes staged patch and summary in the prompt", () => {
    const result = buildCommitMessagePrompt({
      branch: "main",
      stagedSummary: "M README.md",
      stagedPatch: "diff --git a/README.md b/README.md\n+hello",
      includeBranch: false,
    });

    expect(result.prompt).toContain("Conventional Commits");
    expect(result.prompt).toContain("<type>(<optional scope>): <description>");
    expect(result.prompt).toContain("Staged files:");
    expect(result.prompt).toContain("M README.md");
    expect(result.prompt).toContain("Staged patch:");
    expect(result.prompt).toContain("diff --git a/README.md b/README.md");
    expect(result.prompt).toContain("Branch: main");
    expect(result.prompt).not.toContain("branch must be a short semantic git branch fragment");
  });

  it("includes branch generation instruction when includeBranch is true", () => {
    const result = buildCommitMessagePrompt({
      branch: "feature/foo",
      stagedSummary: "M README.md",
      stagedPatch: "diff",
      includeBranch: true,
    });

    expect(result.prompt).toContain("branch must be a short semantic git branch fragment");
  });

  it("shows (detached) when branch is null", () => {
    const result = buildCommitMessagePrompt({
      branch: null,
      stagedSummary: "M a.ts",
      stagedPatch: "diff",
      includeBranch: false,
    });

    expect(result.prompt).toContain("Branch: (detached)");
  });

  it("omits the Jira section entirely when jiraTickets is missing or empty", () => {
    const baseline = buildCommitMessagePrompt({
      branch: "main",
      stagedSummary: "M a.ts",
      stagedPatch: "diff",
      includeBranch: false,
    });
    const empty = buildCommitMessagePrompt({
      branch: "main",
      stagedSummary: "M a.ts",
      stagedPatch: "diff",
      includeBranch: false,
      jiraTickets: [],
    });

    expect(baseline.prompt).toBe(empty.prompt);
    expect(baseline.prompt).not.toContain("Jira tickets:");
    expect(baseline.prompt).not.toContain("Refs:");
    expect(baseline.prompt).not.toContain("[PROJECT-111]");
  });

  it("treats the Jira section as context-only and forbids ticket key in commit subject/body", () => {
    const result = buildCommitMessagePrompt({
      branch: "main",
      stagedSummary: "M a.ts",
      stagedPatch: "diff",
      includeBranch: true,
      jiraTickets: [
        {
          issueKey: "PROJECT-111",
          summary: "Add login flow",
          status: "In Progress",
          issueType: "Task",
          priority: "High",
          assignee: "Maks",
          description: "Login is missing — implement /login endpoint and form.",
          url: "https://example.atlassian.net/browse/PROJECT-111",
        },
      ],
    });

    expect(result.prompt).toContain("Jira tickets:");
    expect(result.prompt).toContain("[PROJECT-111] Add login flow");
    expect(result.prompt).toContain("Status: In Progress");
    expect(result.prompt).toContain("URL: https://example.atlassian.net/browse/PROJECT-111");
    // Branch slug rule still applies (branch generation is allowed to engrave keys).
    expect(result.prompt).toContain("PROJECT-111-add-login");
    // Context-only rule is enforced verbatim.
    expect(result.prompt).toContain("listed for CONTEXT only");
    expect(result.prompt).toContain(
      "Do NOT include the ticket key anywhere in the commit subject or body",
    );
    expect(result.prompt).toContain(
      "No `Refs:` trailer, no `[KEY]` prefix, no parenthesized suffix",
    );
    // Should NOT instruct adding any structural ticket reference.
    expect(result.prompt).not.toContain("## Tickets");
  });
});

describe("buildPrContentPrompt", () => {
  it("includes branch names, commits, and diff in the prompt", () => {
    const result = buildPrContentPrompt({
      baseBranch: "main",
      headBranch: "feature/auth",
      commitSummary: "feat: add login page",
      diffSummary: "3 files changed",
      diffPatch: "diff --git a/auth.ts b/auth.ts\n+export function login()",
    });

    expect(result.prompt).toContain("Conventional Commits");
    expect(result.prompt).toContain("<type>(<optional scope>): <description>");
    expect(result.prompt).toContain("Base branch: main");
    expect(result.prompt).toContain("Head branch: feature/auth");
    expect(result.prompt).toContain("Commits:");
    expect(result.prompt).toContain("feat: add login page");
    expect(result.prompt).toContain("Diff stat:");
    expect(result.prompt).toContain("3 files changed");
    expect(result.prompt).toContain("Diff patch:");
    expect(result.prompt).toContain("export function login()");
  });

  it("omits the Jira section entirely when jiraTickets is missing", () => {
    const baseline = buildPrContentPrompt({
      baseBranch: "main",
      headBranch: "feature/auth",
      commitSummary: "feat: add login page",
      diffSummary: "3 files changed",
      diffPatch: "diff",
    });

    expect(baseline.prompt).not.toContain("Jira tickets:");
    expect(baseline.prompt).not.toContain("PROJECT-111");
    expect(baseline.prompt).not.toContain("## Tickets");
  });

  it("instructs body to weave Jira description into ## Summary, mandates ticket key in title, no Refs trailer", () => {
    const result = buildPrContentPrompt({
      baseBranch: "main",
      headBranch: "feature/auth",
      commitSummary: "feat: add login page",
      diffSummary: "3 files changed",
      diffPatch: "diff",
      jiraTickets: [
        {
          issueKey: "PROJECT-111",
          summary: "Add login flow",
          status: "In Progress",
          issueType: "Task",
          priority: undefined,
          assignee: undefined,
          description: "Users can't log in.",
          url: "https://example.atlassian.net/browse/PROJECT-111",
        },
      ],
    });

    expect(result.prompt).toContain("Jira tickets:");
    expect(result.prompt).toContain("[PROJECT-111] Add login flow");
    // Title-key requirement is mandatory.
    expect(result.prompt).toContain("PR title MUST include the implemented ticket key");
    expect(result.prompt).toContain("non-negotiable");
    // Body rule must instruct using ticket details to inform Summary.
    expect(result.prompt).toContain("inform the 'why' inside the existing `## Summary`");
    // No sidecar block.
    expect(result.prompt).toContain("Do NOT add a `## Tickets` heading");
    // No Refs trailer engraved (the rule explicitly forbids one).
    expect(result.prompt).not.toContain("Refs: PROJECT-111");
    expect(result.prompt).toContain("Do NOT add");
    expect(result.prompt).toContain("`Refs:` trailer");
  });
});

describe("buildBranchNamePrompt", () => {
  it("includes the user message in the prompt", () => {
    const result = buildBranchNamePrompt({
      message: "Fix the login timeout bug",
    });

    expect(result.prompt).toContain("User message:");
    expect(result.prompt).toContain("Fix the login timeout bug");
    expect(result.prompt).not.toContain("Attachment metadata:");
  });

  it("omits the Jira section when jiraTickets is missing or empty", () => {
    const result = buildBranchNamePrompt({
      message: "Fix the login timeout bug",
      jiraTickets: [],
    });
    expect(result.prompt).not.toContain("Jira tickets:");
    expect(result.prompt).not.toContain("PROJECT-111");
  });

  it("instructs the model to engrave one or more keys WITHOUT the marcode/ or feature/ prefix", () => {
    const result = buildBranchNamePrompt({
      message: "Fix the login timeout bug",
      jiraTickets: [
        {
          issueKey: "PROJECT-111",
          summary: "Fix login timeout",
          status: "Open",
          issueType: "Bug",
          priority: undefined,
          assignee: undefined,
          description: undefined,
          url: undefined,
        },
        {
          issueKey: "PROJECT-222",
          summary: "Improve session retention",
          status: "Open",
          issueType: "Task",
          priority: undefined,
          assignee: undefined,
          description: undefined,
          url: undefined,
        },
      ],
    });

    expect(result.prompt).toContain("Jira tickets:");
    expect(result.prompt).toContain("[PROJECT-111] Fix login timeout");
    expect(result.prompt).toContain("[PROJECT-222] Improve session retention");
    expect(result.prompt).toContain("PROJECT-111-PROJECT-222-add-login");
    expect(result.prompt).toContain("Do not include any prefix like `feature/` or `marcode/`");
  });

  it("includes attachment metadata when attachments are provided", () => {
    const result = buildBranchNamePrompt({
      message: "Fix the layout from screenshot",
      attachments: [
        {
          type: "image" as const,
          id: "att-123",
          name: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 12345,
        },
      ],
    });

    expect(result.prompt).toContain("Attachment metadata:");
    expect(result.prompt).toContain("screenshot.png");
    expect(result.prompt).toContain("image/png");
    expect(result.prompt).toContain("12345 bytes");
  });
});

describe("buildThreadTitlePrompt", () => {
  it("includes the user message in the prompt", () => {
    const result = buildThreadTitlePrompt({
      message: "Investigate reconnect regressions after session restore",
    });

    expect(result.prompt).toContain("User message:");
    expect(result.prompt).toContain("Investigate reconnect regressions after session restore");
    expect(result.prompt).not.toContain("Attachment metadata:");
  });

  it("includes attachment metadata when attachments are provided", () => {
    const result = buildThreadTitlePrompt({
      message: "Name this thread from the screenshot",
      attachments: [
        {
          type: "image" as const,
          id: "att-456",
          name: "thread.png",
          mimeType: "image/png",
          sizeBytes: 67890,
        },
      ],
    });

    expect(result.prompt).toContain("Attachment metadata:");
    expect(result.prompt).toContain("thread.png");
    expect(result.prompt).toContain("image/png");
    expect(result.prompt).toContain("67890 bytes");
  });
});

describe("sanitizeThreadTitle", () => {
  it("truncates long titles with the shared sidebar-safe limit", () => {
    expect(
      sanitizeThreadTitle(
        '  "Reconnect failures after restart because the session state does not recover"  ',
      ),
    ).toBe("Reconnect failures after restart because the se...");
  });

  it("unwraps JSON-wrapped title from misbehaving models", () => {
    expect(sanitizeThreadTitle('{"title": "Fix login timeout"}')).toBe("Fix login timeout");
  });

  it("does not break on non-JSON input", () => {
    expect(sanitizeThreadTitle("Fix login timeout")).toBe("Fix login timeout");
  });
});

describe("sanitizePrTitle", () => {
  it("unwraps JSON-wrapped title from misbehaving models", () => {
    expect(
      sanitizePrTitle('{"title": "feat(chat): add editing", "body": "## Summary\\n..."}'),
    ).toBe("feat(chat): add editing");
  });

  it("returns plain text title as-is", () => {
    expect(sanitizePrTitle("feat(chat): add editing")).toBe("feat(chat): add editing");
  });

  it("falls back when title is empty", () => {
    expect(sanitizePrTitle("")).toBe("Update project changes");
  });
});

describe("sanitizePrBody", () => {
  it("unwraps JSON-wrapped body from misbehaving models", () => {
    expect(
      sanitizePrBody(
        '{"title": "feat(chat): add editing", "body": "## Summary\\n- Added editing"}',
      ),
    ).toBe("## Summary\n- Added editing");
  });

  it("returns plain markdown body as-is", () => {
    expect(sanitizePrBody("## Summary\n- Added editing")).toBe("## Summary\n- Added editing");
  });
});

describe("sanitizeCommitSubject", () => {
  it("unwraps JSON-wrapped subject from misbehaving models", () => {
    expect(sanitizeCommitSubject('{"subject": "feat: add editing", "body": "details"}')).toBe(
      "feat: add editing",
    );
  });

  it("returns plain text subject as-is", () => {
    expect(sanitizeCommitSubject("feat: add editing")).toBe("feat: add editing");
  });
});

describe("buildClassifyImplementingJiraTicketsPrompt", () => {
  const refTicket = {
    issueKey: "OTHER-99",
    summary: "Old fix pattern",
    status: "Closed",
    issueType: "Bug",
    priority: undefined,
    assignee: undefined,
    description: "Resolved last quarter via approach X.",
    url: "https://example.atlassian.net/browse/OTHER-99",
  };
  const implTicket = {
    issueKey: "PROJECT-111",
    summary: "Add login flow",
    status: "In Progress",
    issueType: "Task",
    priority: undefined,
    assignee: undefined,
    description: "Users can't log in.",
    url: "https://example.atlassian.net/browse/PROJECT-111",
  };

  it("instructs the model to treat a single mentioned ticket as potentially reference-only", () => {
    const result = buildClassifyImplementingJiraTicketsPrompt({
      message: "fix the login bug the same way we fixed @jira:OTHER-99",
      jiraTickets: [refTicket],
    });

    expect(result.prompt).toContain("A SINGLE ticket can also be reference-only");
    expect(result.prompt).toContain("default to EXCLUDING the ticket");
    expect(result.prompt).toContain("Allowed keys: OTHER-99");
    expect(result.prompt).toContain("[OTHER-99] Old fix pattern");
    expect(result.prompt).toContain("fix the login bug the same way we fixed @jira:OTHER-99");
  });

  it("lists every input key under Allowed keys for hallucination guard", () => {
    const result = buildClassifyImplementingJiraTicketsPrompt({
      message: "implement @jira:PROJECT-111, see @jira:OTHER-99 for context",
      jiraTickets: [implTicket, refTicket],
    });

    expect(result.prompt).toContain("Allowed keys: PROJECT-111, OTHER-99");
    expect(result.prompt).toContain("Do not invent new keys");
  });
});

describe("normalizeCliError", () => {
  it("detects 'Command not found' and includes CLI name in the message", () => {
    const error = normalizeCliError(
      "claude",
      "generateCommitMessage",
      new Error("Command not found: claude"),
      "Something went wrong",
    );

    expect(error).toBeInstanceOf(TextGenerationError);
    expect(error.detail).toContain("Claude CLI");
    expect(error.detail).toContain("not available on PATH");
  });

  it("uses the CLI name from the first argument for codex", () => {
    const error = normalizeCliError(
      "codex",
      "generateBranchName",
      new Error("Command not found: codex"),
      "Something went wrong",
    );

    expect(error).toBeInstanceOf(TextGenerationError);
    expect(error.detail).toContain("Codex CLI");
    expect(error.detail).toContain("not available on PATH");
  });

  it("returns the error as-is if it is already a TextGenerationError", () => {
    const existing = new TextGenerationError({
      operation: "generatePrContent",
      detail: "Already wrapped",
    });

    const result = normalizeCliError("claude", "generatePrContent", existing, "fallback");

    expect(result).toBe(existing);
  });

  it("wraps unknown non-Error values with the fallback message", () => {
    const result = normalizeCliError("codex", "generateCommitMessage", "string error", "fallback");

    expect(result).toBeInstanceOf(TextGenerationError);
    expect(result.detail).toBe("fallback");
  });
});
