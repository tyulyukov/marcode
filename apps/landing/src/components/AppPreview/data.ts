export type PreviewAccessMode = "approval-required" | "auto-accept-edits" | "full-access";

export type PreviewThread = {
  id: string;
  projectId: string;
  title: string;
  age: string;
  branch: string;
  worktree: string;
  access: PreviewAccessMode;
  composerText: string;
  status?: "Working" | "Completed";
};

export type PreviewProject = {
  id: string;
  title: string;
  icon: "marcode" | "round" | "lawn" | "folder";
  threads: string[];
};

export type PreviewTurn =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | {
      type: "tool";
      title: string;
      calls: Array<{
        kind: "command" | "read" | "edit" | "search" | "fetch";
        heading: string;
        preview: string;
      }>;
    };

export const ACCESS_LABELS: Record<PreviewAccessMode, string> = {
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept edits",
  "full-access": "Full access",
};

export const previewProjects: PreviewProject[] = [
  {
    id: "marcode-landing",
    title: "marcode-landing",
    icon: "marcode",
    threads: ["preview-component", "minimap-rail", "rate-limit-meter", "old-hero"],
  },
  {
    id: "round",
    title: "round",
    icon: "round",
    threads: ["round-modernize"],
  },
  {
    id: "lawn",
    title: "lawn",
    icon: "lawn",
    threads: ["lawn-security", "lawn-analyze"],
  },
  {
    id: "shoo",
    title: "shoo",
    icon: "folder",
    threads: ["shoo-secure"],
  },
];

export const previewThreads: PreviewThread[] = [
  {
    id: "preview-component",
    projectId: "marcode-landing",
    title: "Build an interactive app preview to replace the static screensh...",
    age: "1m ago",
    status: "Working",
    branch: "feat/app-preview",
    worktree: "marcode-landing",
    access: "full-access",
    composerText: "",
  },
  {
    id: "minimap-rail",
    projectId: "marcode-landing",
    title: "Wire the chat minimap rail into the timeline",
    age: "6m ago",
    status: "Working",
    branch: "feat/chat-minimap",
    worktree: "marcode-landing",
    access: "auto-accept-edits",
    composerText: "Keep the rail collapsed by default and animate the active dash.",
  },
  {
    id: "rate-limit-meter",
    projectId: "marcode-landing",
    title: "Surface provider rate limit usage in composer",
    age: "8m ago",
    status: "Completed",
    branch: "feat/rate-limit-meter",
    worktree: "marcode-landing",
    access: "approval-required",
    composerText: "Audit the Codex + Claude meter copy before shipping.",
  },
  {
    id: "old-hero",
    projectId: "marcode-landing",
    title: "Drop the static hero screenshot",
    age: "13h ago",
    branch: "main",
    worktree: "marcode-landing",
    access: "full-access",
    composerText: "Remove the legacy <Image> hero and confirm nothing else linked to it.",
  },
  {
    id: "round-modernize",
    projectId: "round",
    title: "Modernize the dashboard shell",
    age: "9m ago",
    status: "Working",
    branch: "feat/shell",
    worktree: "round",
    access: "full-access",
    composerText: "Modernize the shell without changing the route structure.",
  },
  {
    id: "lawn-security",
    projectId: "lawn",
    title: "What potential security issues should we look at first?",
    age: "7m ago",
    branch: "main",
    worktree: "lawn",
    access: "full-access",
    composerText: "Audit the auth path and summarize the risky edges.",
  },
  {
    id: "lawn-analyze",
    projectId: "lawn",
    title: "Help me analyze this project's hot paths",
    age: "9m ago",
    branch: "main",
    worktree: "lawn",
    access: "full-access",
    composerText: "Build a concise project map from the repo structure.",
  },
  {
    id: "shoo-secure",
    projectId: "shoo",
    title: "Is this app secure against token replay?",
    age: "just now",
    status: "Working",
    branch: "main",
    worktree: "shoo",
    access: "full-access",
    composerText: "Inspect the security posture and list the highest-risk fixes first.",
  },
];

export const previewTurns: Record<string, PreviewTurn[]> = {
  "preview-component": [
    {
      type: "user",
      text: "Build an interactive app preview for the landing page. Use MarCode brand colors, no static screenshots.",
    },
    {
      type: "assistant",
      text: "I'll scaffold a React component that mirrors the app shell — sidebar, chat timeline, composer — and make thread switching real. Brand tokens from globals.css, Klaster Sans for the heading, Inter elsewhere.",
    },
    {
      type: "tool",
      title: "Tool calls (3)",
      calls: [
        {
          kind: "read",
          heading: "Read file",
          preview: "apps/landing/src/app/globals.css",
        },
        {
          kind: "read",
          heading: "Read file",
          preview: "apps/landing/src/components/Hero.tsx",
        },
        {
          kind: "search",
          heading: "Searched",
          preview: 'rg "fresh-syntax|curious-sky" apps/landing/src',
        },
      ],
    },
    {
      type: "assistant",
      text: "Brand tokens are wired through `@theme inline` in globals.css. I'll use them directly in Tailwind utilities (bg-fresh-syntax/10, text-curious-sky, etc.) so dark-first stays consistent.",
    },
    {
      type: "user",
      text: "Make sure the threads switch when I click them — not just visual.",
    },
    {
      type: "tool",
      title: "Tool calls (2)",
      calls: [
        {
          kind: "edit",
          heading: "Edited file",
          preview: "apps/landing/src/components/AppPreview/AppPreview.tsx",
        },
        {
          kind: "edit",
          heading: "Edited file",
          preview: "apps/landing/src/components/AppPreview/data.ts",
        },
      ],
    },
    {
      type: "assistant",
      text: "Threads are wired through useState. Clicking any thread row swaps the timeline, composer placeholder, and checkout bar instantly — no animation jank, just structural state.",
    },
  ],
  "minimap-rail": [
    {
      type: "user",
      text: "I want a way to move between long chat sessions faster.",
    },
    {
      type: "assistant",
      text: "I'll add a minimap rail on the right side of the timeline — one dash per user message, hover to expand previews, click to jump.",
    },
    {
      type: "tool",
      title: "Tool calls (2)",
      calls: [
        {
          kind: "read",
          heading: "Read file",
          preview: "apps/web/src/components/chat/MessagesTimeline.tsx",
        },
        {
          kind: "search",
          heading: "Searched",
          preview: 'rg "LegendList|scrollToIndex" apps/web/src',
        },
      ],
    },
    {
      type: "assistant",
      text: "Active dash tracks scroll via the LegendList state. No rAF polling — just two listeners and a pure helper.",
    },
  ],
  "rate-limit-meter": [
    {
      type: "user",
      text: "Surface provider rate limit usage in the composer.",
    },
    {
      type: "tool",
      title: "Tool calls (1)",
      calls: [
        {
          kind: "search",
          heading: "Searched",
          preview: 'rg "account.rate-limits.updated" apps/server/src',
        },
      ],
    },
    {
      type: "assistant",
      text: "ProviderRuntimeIngestion was dropping these events. Wired through to a new ProviderUsageMeter, normalised both Claude (rate_limit_event) and Codex (account/rateLimits/updated) shapes.",
    },
  ],
  "old-hero": [
    {
      type: "user",
      text: "Drop the static hero screenshot. The new preview replaces it.",
    },
    {
      type: "tool",
      title: "Tool calls (1)",
      calls: [
        {
          kind: "command",
          heading: "Ran command",
          preview: "rg --files-with-matches /marcode-screenshot apps/landing/src",
        },
      ],
    },
    {
      type: "assistant",
      text: "Confirmed nothing else referenced it. Removed the <Image> from Hero and dropped the asset from /public.",
    },
  ],
  "round-modernize": [
    {
      type: "user",
      text: "Modernize the dashboard shell without rewriting the routes.",
    },
    {
      type: "assistant",
      text: "Lifting the shell to a layout component preserves the existing route tree. I'll start with the navigation rail and topbar.",
    },
  ],
  "lawn-security": [
    {
      type: "user",
      text: "What potential security issues should we look at first?",
    },
    {
      type: "assistant",
      text: "Auth path is the highest-risk surface. I'll start with token replay, missing CSRF on mutations, and any unvalidated redirects.",
    },
  ],
  "lawn-analyze": [
    {
      type: "user",
      text: "Help me analyze this project's hot paths.",
    },
    {
      type: "assistant",
      text: "Building a project map from the repo structure now. I'll group by package and call out shared services so the architecture is legible at a glance.",
    },
  ],
  "shoo-secure": [
    {
      type: "user",
      text: "Is this app secure against token replay?",
    },
    {
      type: "tool",
      title: "Tool calls (2)",
      calls: [
        {
          kind: "search",
          heading: "Searched",
          preview: 'rg "sessionToken|nonce" apps/server/src/auth',
        },
        {
          kind: "read",
          heading: "Read file",
          preview: "apps/server/src/auth/SessionCredentialService.ts",
        },
      ],
    },
    {
      type: "assistant",
      text: "Sessions are nonced and rotated on every refresh. Replay surface is small but I'd still tighten the pairing-link TTL.",
    },
  ],
};

export const MODELS = [
  { provider: "Claude", model: "Claude Sonnet 4.5", accent: "fresh-syntax" as const },
  { provider: "Claude", model: "Claude Opus 4.1", accent: "fresh-syntax" as const },
  { provider: "Codex", model: "GPT-5", accent: "rebel-mint" as const },
  { provider: "Codex", model: "GPT-5 mini", accent: "rebel-mint" as const },
  { provider: "Cursor", model: "Auto", accent: "dream-shift" as const },
  { provider: "OpenCode", model: "Opencode", accent: "curious-sky" as const },
];
