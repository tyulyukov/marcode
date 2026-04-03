import {
  BrainCircuitIcon,
  GitBranchIcon,
  TerminalIcon,
  ZapIcon,
  ShieldCheckIcon,
  LayoutGridIcon,
  LayersIcon,
} from "lucide-react";

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  accentGlow: string;
  gridArea: string;
}

const FEATURES: Feature[] = [
  {
    title: "One GUI for Your Agents",
    description:
      "Claude Code, Codex — one interface for every coding agent. Pick your CLI, pick your model, and go.",
    icon: <BrainCircuitIcon className="size-7" />,
    accent: "fresh-syntax",
    accentGlow: "rgba(119,230,233,0.12)",
    gridArea: "hero",
  },
  {
    title: "Git-Integrated",
    description:
      "Branch, commit, create PRs — all from the conversation. GitHub and GitLab supported.",
    icon: <GitBranchIcon className="size-6" />,
    accent: "curious-sky",
    accentGlow: "rgba(127,161,255,0.12)",
    gridArea: "git",
  },
  {
    title: "Terminal Built-In",
    description: "Attach terminal output as context. The agent sees what you see.",
    icon: <TerminalIcon className="size-6" />,
    accent: "rebel-mint",
    accentGlow: "rgba(100,225,148,0.12)",
    gridArea: "term",
  },
  {
    title: "Rich Tool Display",
    description:
      "Every tool call, subagent spawn, file edit, and shell command — rendered with a purpose-built UI, not raw JSON.",
    icon: <LayersIcon className="size-6" />,
    accent: "dream-shift",
    accentGlow: "rgba(195,156,255,0.12)",
    gridArea: "tools",
  },
  {
    title: "Fast by Default",
    description:
      "Incremental streaming, structural sharing, fine-grained selectors, and dozens of optimizations under the hood. Zero jank, even under heavy load.",
    icon: <ZapIcon className="size-6" />,
    accent: "sunbyte",
    accentGlow: "rgba(249,214,71,0.12)",
    gridArea: "fast",
  },
  {
    title: "Secure Worktrees",
    description: "Agents work in isolated git worktrees. Revert any checkpoint with one click.",
    icon: <ShieldCheckIcon className="size-6" />,
    accent: "fresh-syntax",
    accentGlow: "rgba(119,230,233,0.12)",
    gridArea: "safe",
  },
  {
    title: "Jira Integration",
    description:
      "Mention tasks with @PROJ-123, browse sprints, paste URLs. Context flows automatically.",
    icon: <LayoutGridIcon className="size-6" />,
    accent: "curious-sky",
    accentGlow: "rgba(127,161,255,0.12)",
    gridArea: "jira",
  },
];

const ACCENT_STYLES: Record<
  string,
  { icon: string; iconBg: string; border: string; circle: string }
> = {
  "fresh-syntax": {
    icon: "text-fresh-syntax",
    iconBg: "bg-fresh-syntax/10",
    border: "group-hover:border-fresh-syntax/30",
    circle: "bg-fresh-syntax/5",
  },
  "curious-sky": {
    icon: "text-curious-sky",
    iconBg: "bg-curious-sky/10",
    border: "group-hover:border-curious-sky/30",
    circle: "bg-curious-sky/5",
  },
  "dream-shift": {
    icon: "text-dream-shift",
    iconBg: "bg-dream-shift/10",
    border: "group-hover:border-dream-shift/30",
    circle: "bg-dream-shift/5",
  },
  sunbyte: {
    icon: "text-sunbyte",
    iconBg: "bg-sunbyte/10",
    border: "group-hover:border-sunbyte/30",
    circle: "bg-sunbyte/5",
  },
  "rebel-mint": {
    icon: "text-rebel-mint",
    iconBg: "bg-rebel-mint/10",
    border: "group-hover:border-rebel-mint/30",
    circle: "bg-rebel-mint/5",
  },
};

function FeatureCard({ feature, isHero }: { feature: Feature; isHero: boolean }) {
  const styles = ACCENT_STYLES[feature.accent]!;

  return (
    <div
      className={`group relative overflow-hidden rounded-[20px] border border-border/50 bg-neo-pine/20 transition-all hover:bg-neo-pine/30 ${styles.border}`}
      style={{ gridArea: feature.gridArea }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${feature.accentGlow}, transparent 60%)`,
        }}
      />

      <div
        className={`pointer-events-none absolute rounded-full blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100 ${styles.circle}`}
        style={
          isHero
            ? { width: "300px", height: "300px", bottom: "-100px", right: "-80px" }
            : { width: "180px", height: "180px", bottom: "-60px", right: "-40px" }
        }
      />

      <div className={`relative z-10 flex flex-col gap-3 ${isHero ? "p-8 sm:p-10" : "p-6"}`}>
        <div
          className={`flex items-center justify-center rounded-xl ${styles.iconBg} ${styles.icon} ${isHero ? "size-12" : "size-10"}`}
        >
          {feature.icon}
        </div>
        <h3
          className={`font-medium ${isHero ? "text-xl sm:text-2xl" : "text-lg"}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          {feature.title}
        </h3>
        <p className={`leading-relaxed text-muted-foreground ${isHero ? "text-base" : "text-sm"}`}>
          {feature.description}
        </p>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-24 pb-24">
      <h2
        className="mb-12 text-center text-3xl font-medium tracking-tight sm:text-4xl"
        style={{ letterSpacing: "-0.02em" }}
      >
        Everything you need, <span className="text-muted-foreground">nothing you don&apos;t</span>
      </h2>

      <div className="bento-grid">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} isHero={feature.gridArea === "hero"} />
        ))}
      </div>
    </section>
  );
}
