import {
  AnchorIcon,
  BookOpenIcon,
  BoxIcon,
  CloudIcon,
  CodeIcon,
  CompassIcon,
  DatabaseIcon,
  FeatherIcon,
  FlameIcon,
  GitBranchIcon,
  GlobeIcon,
  HexagonIcon,
  LayersIcon,
  LeafIcon,
  MonitorIcon,
  OrbitIcon,
  PackageIcon,
  PaletteIcon,
  RocketIcon,
  ServerIcon,
  SparklesIcon,
  TargetIcon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";

const SEEDED_ICONS = [
  DatabaseIcon,
  MonitorIcon,
  ZapIcon,
  RocketIcon,
  FlameIcon,
  SparklesIcon,
  CodeIcon,
  TerminalIcon,
  ServerIcon,
  CloudIcon,
  GlobeIcon,
  PackageIcon,
  BoxIcon,
  LayersIcon,
  HexagonIcon,
  OrbitIcon,
  CompassIcon,
  AnchorIcon,
  LeafIcon,
  FeatherIcon,
  PaletteIcon,
  BookOpenIcon,
  GitBranchIcon,
  TargetIcon,
] as const;

const SEEDED_HUES = [200, 215, 235, 260, 285, 310, 335, 0, 20, 40, 145, 175] as const;

function fnv1aHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function resolveSeededProjectVisual(seed: string) {
  const hash = fnv1aHash(seed);
  const hue = SEEDED_HUES[hash % SEEDED_HUES.length]!;
  const Icon = SEEDED_ICONS[Math.floor(hash / SEEDED_HUES.length) % SEEDED_ICONS.length]!;
  return { hue, Icon };
}

export function ProjectSeededIcon(input: {
  seed: string;
  className?: string | undefined;
  iconClassName?: string | undefined;
}) {
  const { hue, Icon } = resolveSeededProjectVisual(input.seed);
  return (
    <span
      aria-hidden
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md ${
        input.className ?? ""
      }`}
      style={{
        backgroundColor: `hsl(${hue} 65% 55% / 0.22)`,
        color: `hsl(${hue} 70% 55%)`,
      }}
    >
      <Icon className={input.iconClassName ?? "size-3.5"} strokeWidth={2.25} />
    </span>
  );
}
