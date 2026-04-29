"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowDownUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  EyeIcon,
  FolderIcon,
  GitBranchIcon,
  GlobeIcon,
  ImageIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import {
  ACCESS_LABELS,
  MODELS,
  previewProjects,
  previewThreads,
  previewTurns,
  type PreviewAccessMode,
  type PreviewTurn,
} from "./data";

type ToolCallKind = "command" | "read" | "edit" | "search" | "fetch";

const TOOL_ICONS: Record<ToolCallKind, typeof TerminalIcon> = {
  command: TerminalIcon,
  read: EyeIcon,
  edit: PencilIcon,
  search: SearchIcon,
  fetch: GlobeIcon,
};

const ACCESS_ICONS: Record<PreviewAccessMode, typeof ShieldIcon> = {
  "approval-required": ShieldIcon,
  "auto-accept-edits": LockIcon,
  "full-access": ZapIcon,
};

const ACCESS_ACCENTS: Record<PreviewAccessMode, string> = {
  "approval-required": "text-sunbyte",
  "auto-accept-edits": "text-curious-sky",
  "full-access": "text-rebel-mint",
};

const MODEL_DOT_BG: Record<"fresh-syntax" | "rebel-mint" | "dream-shift" | "curious-sky", string> =
  {
    "fresh-syntax": "bg-fresh-syntax",
    "rebel-mint": "bg-rebel-mint",
    "dream-shift": "bg-dream-shift",
    "curious-sky": "bg-curious-sky",
  };

function ProjectIcon({ icon }: { icon: "marcode" | "round" | "lawn" | "folder" }) {
  if (icon === "marcode") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-fresh-syntax/15 text-fresh-syntax">
        <span
          className="text-[10px] font-semibold leading-none"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          M
        </span>
      </span>
    );
  }
  if (icon === "round") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-curious-sky/15 text-curious-sky">
        <span className="block size-2 rounded-full border-2 border-current" />
      </span>
    );
  }
  if (icon === "lawn") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-rebel-mint/15 text-rebel-mint">
        <svg viewBox="0 0 24 24" className="size-3" aria-hidden>
          <path d="m3 18 2-10 4.4 4.4L12 4l2.6 8.4L19 8l2 10Z" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-dream-shift/15 text-dream-shift">
      <FolderIcon className="size-3" />
    </span>
  );
}

function ToolCallRow({ call }: { call: { kind: ToolCallKind; heading: string; preview: string } }) {
  const Icon = TOOL_ICONS[call.kind];
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-foreground/90">{call.heading}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{call.preview}</div>
      </div>
    </div>
  );
}

function TurnView({ turn }: { turn: PreviewTurn }) {
  if (turn.type === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-fresh-syntax/25 bg-fresh-syntax/10 px-3.5 py-2 text-[13px] leading-relaxed text-foreground/95">
          {turn.text}
        </div>
      </div>
    );
  }

  if (turn.type === "tool") {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-dream-shift/15 text-dream-shift">
          <WrenchIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">{turn.title}</div>
          <div className="space-y-1.5">
            {turn.calls.map((call, i) => (
              <ToolCallRow key={i} call={call} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-fresh-syntax/15 text-fresh-syntax">
        <span
          className="text-[10px] font-semibold leading-none"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          M
        </span>
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground/85">
        {turn.text}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "Working" | "Completed" }) {
  if (status === "Working") {
    return (
      <span className="relative inline-flex size-1.5 items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-fresh-syntax/40" />
        <span className="relative inline-flex size-1.5 rounded-full bg-fresh-syntax" />
      </span>
    );
  }
  return <span className="inline-flex size-1.5 rounded-full bg-rebel-mint" />;
}

function PopoverButton({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`group flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-background/60 hover:text-foreground ${accent ?? ""}`}
      aria-label={label}
    >
      {icon}
      <span className="font-medium text-foreground/85">{value}</span>
      <ChevronDownIcon className="size-3 opacity-60" />
    </button>
  );
}

export function AppPreview() {
  const [activeThreadId, setActiveThreadId] = useState(previewThreads[0]!.id);
  const [activeModel, setActiveModel] = useState(MODELS[0]!.model);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const activeThread = useMemo(
    () => previewThreads.find((t) => t.id === activeThreadId) ?? previewThreads[0]!,
    [activeThreadId],
  );
  const activeTurns = previewTurns[activeThreadId] ?? [];
  const AccessIcon = ACCESS_ICONS[activeThread.access];
  const accessAccent = ACCESS_ACCENTS[activeThread.access];

  const modelMeta = MODELS.find((m) => m.model === activeModel) ?? MODELS[0]!;

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <div className="relative w-full">
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -inset-x-12 -top-12 -bottom-12 -z-10">
        <div className="absolute -left-24 top-12 size-72 rounded-full bg-fresh-syntax/10 blur-3xl" />
        <div className="absolute -right-20 bottom-0 size-80 rounded-full bg-curious-sky/10 blur-3xl" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-noir/80 shadow-[0_30px_120px_-30px_rgba(119,230,233,0.25)] backdrop-blur-sm">
        <div className="flex h-[600px] min-h-0">
          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="flex w-[260px] shrink-0 flex-col border-r border-border/50 bg-background/40">
            {/* Top bar with traffic lights */}
            <div className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[12px] font-medium tracking-tight"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  MarCode
                </span>
                <span className="rounded bg-fresh-syntax/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-fresh-syntax">
                  BETA
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="flex w-full items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border/70"
              >
                <SearchIcon className="size-3.5" />
                <span className="flex-1 text-left">Search</span>
                <span className="rounded border border-border/60 px-1.5 py-px text-[10px]">⌘K</span>
              </button>
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between px-4 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Projects
              </span>
              <div className="flex items-center gap-1 text-muted-foreground">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Sort projects"
                  className="grid size-5 place-items-center rounded transition-colors hover:bg-background/60 hover:text-foreground"
                >
                  <ArrowDownUpIcon className="size-3" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="New thread"
                  className="grid size-5 place-items-center rounded transition-colors hover:bg-background/60 hover:text-foreground"
                >
                  <PlusIcon className="size-3" />
                </button>
              </div>
            </div>

            {/* Project list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {previewProjects.map((project) => {
                const isCollapsed = collapsedProjects.has(project.id);
                const projectThreads = project.threads
                  .map((id) => previewThreads.find((t) => t.id === id))
                  .filter((t): t is NonNullable<typeof t> => Boolean(t));

                return (
                  <div key={project.id} className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-background/40"
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronRightIcon
                        className={`size-3 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      />
                      <ProjectIcon icon={project.icon} />
                      <span className="truncate text-[12px] font-medium text-foreground/90">
                        {project.title}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-0.5 ml-3 border-l border-border/30 pl-1">
                        {projectThreads.map((thread) => {
                          const active = thread.id === activeThreadId;
                          return (
                            <button
                              key={thread.id}
                              type="button"
                              onClick={() => setActiveThreadId(thread.id)}
                              className={`group flex w-full items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors ${
                                active
                                  ? "bg-fresh-syntax/10 text-foreground"
                                  : "text-muted-foreground hover:bg-background/40 hover:text-foreground/90"
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-start gap-1.5">
                                  <span className="line-clamp-2 flex-1 text-[11.5px] leading-snug">
                                    {thread.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                                  {thread.status && <StatusDot status={thread.status} />}
                                  <span>{thread.age}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* ── Main pane ───────────────────────────────────────── */}
          <main className="flex min-w-0 flex-1 flex-col bg-background/20">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/50 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground/95">
                  {activeThread.title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ProjectIcon
                    icon={
                      previewProjects.find((p) => p.id === activeThread.projectId)?.icon ?? "folder"
                    }
                  />
                  <span>{previewProjects.find((p) => p.id === activeThread.projectId)?.title}</span>
                  <span>·</span>
                  <span>{activeThread.age}</span>
                </div>
              </div>
              {activeThread.status === "Working" ? (
                <span className="flex items-center gap-1.5 rounded-full border border-fresh-syntax/30 bg-fresh-syntax/10 px-2 py-0.5 text-[10px] font-medium text-fresh-syntax">
                  <StatusDot status="Working" />
                  Working
                </span>
              ) : activeThread.status === "Completed" ? (
                <span className="flex items-center gap-1.5 rounded-full border border-rebel-mint/30 bg-rebel-mint/10 px-2 py-0.5 text-[10px] font-medium text-rebel-mint">
                  <StatusDot status="Completed" />
                  Completed
                </span>
              ) : null}
            </header>

            {/* Timeline */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 px-5 py-5">
                {activeTurns.length === 0 ? (
                  <div className="flex h-full items-center justify-center pt-16 text-[13px] text-muted-foreground">
                    Send a prompt to begin a new turn.
                  </div>
                ) : (
                  activeTurns.map((turn, i) => <TurnView key={i} turn={turn} />)
                )}
                {activeThread.status === "Working" && (
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-fresh-syntax" />
                    Working...
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border/50 bg-background/40 p-3">
              <div className="rounded-xl border border-border/60 bg-noir/40 p-3">
                <textarea
                  key={activeThreadId}
                  defaultValue={activeThread.composerText}
                  placeholder="Send a message…"
                  rows={2}
                  className="w-full resize-none border-none bg-transparent text-[13px] leading-relaxed text-foreground/95 placeholder:text-muted-foreground/70 focus:outline-none"
                />

                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/40 pt-2">
                  {/* Model picker */}
                  <div className="relative">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="group flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-background/60 hover:text-foreground"
                    >
                      <span
                        className={`size-1.5 rounded-full ${MODEL_DOT_BG[modelMeta.accent]}`}
                        aria-hidden
                      />
                      <span className="font-medium text-foreground/85">{activeModel}</span>
                      <ChevronDownIcon className="size-3 opacity-60" />
                    </button>
                  </div>

                  <PopoverButton
                    label="Effort"
                    value="Medium"
                    icon={<ZapIcon className="size-3 text-sunbyte" />}
                  />
                  <PopoverButton
                    label="Access"
                    value={ACCESS_LABELS[activeThread.access]}
                    icon={<AccessIcon className={`size-3 ${accessAccent}`} />}
                  />

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                    >
                      <ImageIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      className="flex items-center gap-1.5 rounded-md bg-fresh-syntax px-2.5 py-1 text-[11px] font-medium text-noir transition-opacity hover:opacity-90"
                    >
                      <span>Send</span>
                      <CornerDownLeftIcon className="size-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Checkout bar */}
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                <FolderIcon className="size-3 shrink-0" />
                <span className="font-medium text-foreground/80">{activeThread.worktree}</span>
                <span className="text-border">·</span>
                <GitBranchIcon className="size-3 shrink-0" />
                <span className="font-medium text-foreground/80">{activeThread.branch}</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/80">
                  <ArrowDownIcon className="size-3" />
                  <span>Pull</span>
                </span>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
