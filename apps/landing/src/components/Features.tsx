import {
  BrainCircuitIcon,
  GitBranchIcon,
  TerminalIcon,
  ZapIcon,
  ShieldCheckIcon,
  LayoutGridIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
  span?: "wide" | undefined;
}

const FEATURES: Feature[] = [
  {
    title: "Claude-First",
    description:
      "Built from the ground up for Claude Code. Opus, Sonnet, Haiku — pick your model and go.",
    icon: <BrainCircuitIcon className="size-6" />,
    span: "wide",
  },
  {
    title: "Git-Integrated",
    description:
      "Branch, commit, create PRs — all from the conversation. GitHub and GitLab supported.",
    icon: <GitBranchIcon className="size-6" />,
  },
  {
    title: "Terminal Built-In",
    description: "Attach terminal output as context. The agent sees what you see.",
    icon: <TerminalIcon className="size-6" />,
  },
  {
    title: "Fast by Default",
    description:
      "Incremental event streaming, structural sharing, fine-grained selectors. No jank under load.",
    icon: <ZapIcon className="size-6" />,
    span: "wide",
  },
  {
    title: "Secure Worktrees",
    description: "Agents work in isolated git worktrees. Revert any checkpoint with one click.",
    icon: <ShieldCheckIcon className="size-6" />,
  },
  {
    title: "Jira Integration",
    description:
      "Mention tasks with @PROJ-123, browse sprints, paste URLs. Context flows automatically.",
    icon: <LayoutGridIcon className="size-6" />,
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50 bg-neo-pine/20 p-6 transition-all hover:border-fresh-syntax/30 hover:bg-neo-pine/30",
        feature.span === "wide" && "sm:col-span-2",
      )}
    >
      {/* Gradient border glow on hover (BRAND.md: gradient borders ~3pt) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: "linear-gradient(135deg, rgba(119,230,233,0.08), rgba(127,161,255,0.08))",
        }}
      />

      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-fresh-syntax/10 text-fresh-syntax">
          {feature.icon}
        </div>
        <h3 className="text-lg font-medium">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <h2
        className="mb-12 text-center text-3xl font-medium tracking-tight sm:text-4xl"
        style={{ letterSpacing: "-0.02em" }}
      >
        Everything you need, <span className="text-muted-foreground">nothing you don&apos;t</span>
      </h2>

      {/* Bento grid (BRAND.md: asymmetric modules) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}
