import { ExternalLinkIcon } from "lucide-react";

interface Step {
  title: string;
  description: React.ReactNode;
  accent: string;
}

const ACCENT_COLOR: Record<string, { text: string; ring: string; glow: string; dot: string }> = {
  "fresh-syntax": {
    text: "text-fresh-syntax",
    ring: "ring-fresh-syntax/30",
    glow: "shadow-[0_0_24px_rgba(119,230,233,0.25)]",
    dot: "bg-fresh-syntax",
  },
  sunbyte: {
    text: "text-sunbyte",
    ring: "ring-sunbyte/30",
    glow: "shadow-[0_0_24px_rgba(249,214,71,0.25)]",
    dot: "bg-sunbyte",
  },
  "curious-sky": {
    text: "text-curious-sky",
    ring: "ring-curious-sky/30",
    glow: "shadow-[0_0_24px_rgba(127,161,255,0.25)]",
    dot: "bg-curious-sky",
  },
  "dream-shift": {
    text: "text-dream-shift",
    ring: "ring-dream-shift/30",
    glow: "shadow-[0_0_24px_rgba(195,156,255,0.25)]",
    dot: "bg-dream-shift",
  },
};

const STEPS: Step[] = [
  {
    title: "Download MarCode",
    accent: "fresh-syntax",
    description: (
      <>
        Grab the latest release for your OS from the button above — free, open source, available on
        macOS, Windows, and Linux.
      </>
    ),
  },
  {
    title: "macOS: Bypass Gatekeeper",
    accent: "sunbyte",
    description: (
      <>
        The app isn&apos;t signed with an Apple Developer certificate yet. After the first launch
        warning, go to{" "}
        <span className="text-foreground font-medium">
          System Settings &rarr; Privacy &amp; Security
        </span>{" "}
        &rarr; scroll down &rarr; <span className="text-foreground font-medium">Open Anyway</span>.
        The code is{" "}
        <ExternalLink href="https://github.com/tyulyukov/marcode" color="fresh-syntax">
          fully open source
        </ExternalLink>{" "}
        — inspect it yourself.
      </>
    ),
  },
  {
    title: "Install a Git Host CLI",
    accent: "curious-sky",
    description: (
      <>
        For the full git integration experience (branches, PRs/MRs from chat), install and
        authenticate your host&apos;s CLI:
        <span className="mt-2.5 flex gap-4">
          <ExternalLink href="https://cli.github.com" color="curious-sky">
            GitHub CLI
          </ExternalLink>
          <ExternalLink href="https://gitlab.com/gitlab-org/cli#installation" color="curious-sky">
            GitLab CLI
          </ExternalLink>
        </span>
        <span className="mt-1.5 block text-muted-foreground/60 text-xs">
          GitLab users — authenticate via{" "}
          <ExternalLink
            href="https://docs.gitlab.com/security/token_overview.html#personal-access-tokens"
            color="muted"
          >
            Personal Access Token
          </ExternalLink>{" "}
          with at least{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
            api
          </code>{" "}
          and{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
            write_repository
          </code>{" "}
          scopes.
        </span>
      </>
    ),
  },
  {
    title: "Connect Integrations",
    accent: "dream-shift",
    description: (
      <>
        Open settings to connect Jira, add your provider API keys, pick a model, and you&apos;re
        ready to ship.
      </>
    ),
  },
];

function ExternalLink({
  href,
  color,
  children,
}: {
  href: string;
  color: string;
  children: React.ReactNode;
}) {
  const colorClass =
    color === "muted"
      ? "text-muted-foreground decoration-muted-foreground/30 hover:decoration-muted-foreground"
      : `text-${color} decoration-${color}/30 hover:decoration-${color}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 underline underline-offset-2 transition-colors ${colorClass}`}
    >
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

function TimelineStep({ step, index, isLast }: { step: Step; index: number; isLast: boolean }) {
  const colors = ACCENT_COLOR[step.accent]!;

  return (
    <div className="group relative grid grid-cols-[40px_1fr] gap-6 sm:grid-cols-[56px_1fr]">
      <div className="flex flex-col items-center">
        <div
          className={`relative flex size-10 items-center justify-center rounded-full ring-2 ${colors.ring} ${colors.glow} transition-shadow duration-300 group-hover:shadow-[0_0_32px_rgba(119,230,233,0.35)] sm:size-14`}
        >
          <div className={`size-2.5 rounded-full ${colors.dot} sm:size-3`} />
          <span
            className={`absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-noir text-[10px] font-medium ring-1 ${colors.ring} ${colors.text} sm:size-6 sm:text-xs`}
          >
            {index + 1}
          </span>
        </div>

        {!isLast && (
          <div className="relative mt-3 w-px flex-1">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, var(--color-fresh-syntax) 0%, var(--color-curious-sky) 50%, var(--color-dream-shift) 100%)",
                opacity: 0.15,
              }}
            />
          </div>
        )}
      </div>

      <div className="pb-10">
        <h3
          className={`text-lg font-medium sm:text-xl ${colors.text}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export function Installation() {
  return (
    <section className="mx-auto max-w-2xl pr-6 pl-6 pt-24 pb-12 sm:pl-12">
      <h2
        className="mb-14 text-center text-3xl font-medium tracking-tight sm:text-4xl"
        style={{ letterSpacing: "-0.02em" }}
      >
        Up and running <span className="text-muted-foreground">in minutes</span>
      </h2>

      <div>
        {STEPS.map((step, i) => (
          <TimelineStep key={step.title} step={step} index={i} isLast={i === STEPS.length - 1} />
        ))}
      </div>
    </section>
  );
}
