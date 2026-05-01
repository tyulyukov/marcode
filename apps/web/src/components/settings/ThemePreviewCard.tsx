import { CheckIcon, TerminalIcon } from "lucide-react";
import { type CSSProperties } from "react";

import { useSettings } from "../../hooks/useSettings";
import { computeAccentForeground } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import type { ThemeDefinition, ThemeVariables } from "../../themes/types";

const MARCODE_LIGHT_PREVIEW: ThemeVariables = {
  "--background": "#ffffff",
  "--foreground": "#222222",
  "--card": "#ffffff",
  "--card-foreground": "#222222",
  "--popover": "#ffffff",
  "--popover-foreground": "#222222",
  "--primary": "#265253",
  "--primary-foreground": "#f9fdfd",
  "--secondary": "rgba(0,0,0,0.04)",
  "--secondary-foreground": "#222222",
  "--muted": "rgba(0,0,0,0.04)",
  "--muted-foreground": "#6c7777",
  "--accent": "rgba(0,0,0,0.04)",
  "--accent-foreground": "#222222",
  "--destructive": "#ef4444",
  "--destructive-foreground": "#b91c1c",
  "--border": "rgba(0,0,0,0.08)",
  "--input": "rgba(0,0,0,0.10)",
  "--ring": "#265253",
  "--info": "#7fa1ff",
  "--info-foreground": "#3a4f8f",
  "--success": "#64e194",
  "--success-foreground": "#3c8757",
  "--warning": "#f9d647",
  "--warning-foreground": "#9a7e29",
};

const MARCODE_DARK_PREVIEW: ThemeVariables = {
  "--background": "#20242c",
  "--foreground": "#f9fdfd",
  "--card": "#262b34",
  "--card-foreground": "#f9fdfd",
  "--popover": "#2c333d",
  "--popover-foreground": "#f9fdfd",
  "--primary": "#77e6e9",
  "--primary-foreground": "#222222",
  "--secondary": "rgba(249,253,253,0.06)",
  "--secondary-foreground": "#f9fdfd",
  "--muted": "rgba(249,253,253,0.08)",
  "--muted-foreground": "#909696",
  "--accent": "rgba(119,230,233,0.10)",
  "--accent-foreground": "#f9fdfd",
  "--destructive": "#f56565",
  "--destructive-foreground": "#fca5a5",
  "--border": "rgba(249,253,253,0.10)",
  "--input": "rgba(249,253,253,0.12)",
  "--ring": "#77e6e9",
  "--info": "#7fa1ff",
  "--info-foreground": "#7fa1ff",
  "--success": "#64e194",
  "--success-foreground": "#64e194",
  "--warning": "#f9d647",
  "--warning-foreground": "#f9d647",
};

function resolvePreviewVariables(theme: ThemeDefinition): ThemeVariables {
  if (theme.variables) return theme.variables;
  return theme.id === "marcode-dark" ? MARCODE_DARK_PREVIEW : MARCODE_LIGHT_PREVIEW;
}

function variablesToStyle(variables: ThemeVariables): CSSProperties {
  return variables as unknown as CSSProperties;
}

function withAccent(variables: ThemeVariables, accent: string | null): CSSProperties {
  const base = variablesToStyle(variables);
  if (!accent) return base;
  return {
    ...base,
    "--primary": accent,
    "--primary-foreground": computeAccentForeground(accent),
    "--ring": accent,
  } as CSSProperties;
}

type ThemePreviewMode = { kind: "theme"; theme: ThemeDefinition } | { kind: "system" };

type ThemePreviewCardProps = {
  mode: ThemePreviewMode;
  size: "card" | "preview";
  label?: string;
  selected?: boolean;
  onClick?: () => void;
};

export function ThemePreviewCard({ mode, size, label, selected, onClick }: ThemePreviewCardProps) {
  if (size === "preview") {
    return <PreviewSurface mode={mode} />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Apply ${label ?? "theme"}`}
      className="group flex w-32 shrink-0 snap-start flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        className={cn(
          "relative h-20 w-32 overflow-hidden rounded-lg border border-border/60 transition",
          selected
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "opacity-90 group-hover:opacity-100 group-hover:scale-[1.03]",
        )}
      >
        <CardSurface mode={mode} />
      </div>
      <span
        className={cn(
          "max-w-[8rem] truncate text-[11px] font-medium tracking-tight",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function CardSurface({ mode }: { mode: ThemePreviewMode }) {
  if (mode.kind === "system") {
    return (
      <div className="flex h-full w-full">
        <div className="h-full w-1/2" style={variablesToStyle(MARCODE_LIGHT_PREVIEW)}>
          <SystemHalfSilhouette />
        </div>
        <div
          className="h-full w-1/2 border-l border-border/60"
          style={variablesToStyle(MARCODE_DARK_PREVIEW)}
        >
          <SystemHalfSilhouette />
        </div>
      </div>
    );
  }
  return (
    <div className="h-full w-full" style={variablesToStyle(resolvePreviewVariables(mode.theme))}>
      <MiniChatSilhouette />
    </div>
  );
}

function PreviewSurface({ mode }: { mode: ThemePreviewMode }) {
  const accent = useSettings((s) => s.accentOverride);
  if (mode.kind === "system") {
    return (
      <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border/60 shadow-sm">
        <div
          className="absolute inset-y-0 left-0 w-1/2"
          style={withAccent(MARCODE_LIGHT_PREVIEW, accent)}
        >
          <MiniChat />
        </div>
        <div
          className="absolute inset-y-0 right-0 w-1/2 border-l border-border/60"
          style={withAccent(MARCODE_DARK_PREVIEW, accent)}
        >
          <MiniChat />
        </div>
      </div>
    );
  }
  return (
    <div
      style={withAccent(resolvePreviewVariables(mode.theme), accent)}
      className="relative h-64 w-full overflow-hidden rounded-2xl border border-border/60 shadow-sm"
    >
      <MiniChat />
    </div>
  );
}

function MiniChatSilhouette() {
  return (
    <div className="flex h-full w-full flex-col gap-1.5 bg-background px-2.5 py-2">
      <div className="flex justify-end">
        <div className="flex max-w-[78%] flex-col gap-0.5 rounded-md rounded-br-sm border border-primary/30 bg-primary/5 px-1.5 py-1">
          <div className="h-1 w-12 rounded-full bg-foreground/30" />
          <div className="h-1 w-9 rounded-full bg-foreground/30" />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1">
        <ToolCardSilhouette wide />
        <ToolCardSilhouette />
      </div>
    </div>
  );
}

function SystemHalfSilhouette() {
  return (
    <div className="flex h-full w-full flex-col items-stretch justify-between gap-1 bg-background px-1.5 py-2">
      <div className="flex justify-end">
        <div className="h-2.5 w-8 rounded-md rounded-br-[2px] border border-primary/30 bg-primary/10" />
      </div>
      <div className="flex flex-col gap-0.5">
        <SystemHalfToolStrip />
        <SystemHalfToolStrip />
      </div>
    </div>
  );
}

function SystemHalfToolStrip() {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border/40 bg-card/40 px-1 py-0.5">
      <div className="size-1 shrink-0 rounded-sm bg-primary/60" />
      <div className="h-1 w-5 rounded-full bg-foreground/30" />
      <div className="ml-auto size-1 shrink-0 rounded-full bg-success/70" />
    </div>
  );
}

function ToolCardSilhouette({ wide }: { wide?: boolean } = {}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border/40 bg-card/40 px-1.5 py-0.5">
      <div className="size-1 shrink-0 rounded-sm bg-primary/60" />
      <div className={cn("h-1 rounded-full bg-foreground/30", wide ? "w-12" : "w-8")} />
      <div className="ml-auto size-1 shrink-0 rounded-full bg-success/70" />
    </div>
  );
}

function MiniChat() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-background px-5 py-4">
      <div className="flex justify-end">
        <div className="relative max-w-[78%] rounded-2xl rounded-br-sm border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[11px] leading-snug text-foreground">
            Implement dark mode in AdBraze. Make no mistakes.
          </p>
          <span className="mt-1 block text-right text-[8px] text-muted-foreground/60">09:42</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 px-1">
        <p className="text-[11px] leading-snug text-foreground">
          Promise I won&rsquo;t just slap{" "}
          <code className="rounded-sm bg-muted px-1 py-px font-mono text-[10px] text-foreground">
            bg-black
          </code>{" "}
          on everything &mdash; mapping the existing styles first.
        </p>
        <p className="text-[8px] text-muted-foreground/50">09:42 &middot; 6s</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <MiniToolCard command="rg -n 'bg-white|text-black' apps/web/src" />
        <MiniToolCard command="rg -l '@theme inline' apps/web/src" />
      </div>
    </div>
  );
}

function MiniToolCard({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/25 px-2.5 py-1.5">
      <TerminalIcon className="size-3 shrink-0 text-primary/60" />
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
        {command}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[9px] text-success-foreground/80">
        <CheckIcon className="size-2.5" />
        Success
      </span>
    </div>
  );
}
