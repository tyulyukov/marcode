import type { ThemeDefinition, ThemeGroup } from "./types";
import { AYU_THEMES } from "./definitions/ayu";
import { CATPPUCCIN_THEMES } from "./definitions/catppuccin";
import { DRACULA_THEMES } from "./definitions/dracula";
import { GITHUB_THEMES } from "./definitions/github";
import { GRUVBOX_THEMES } from "./definitions/gruvbox";
import { MARCODE_THEMES } from "./definitions/marcode";
import { MONOKAI_THEMES } from "./definitions/monokai";
import { NORD_THEMES } from "./definitions/nord";
import { ONE_DARK_THEMES } from "./definitions/one-dark";
import { ROSE_PINE_THEMES } from "./definitions/rose-pine";
import { SOLARIZED_THEMES } from "./definitions/solarized";
import { TOKYO_NIGHT_THEMES } from "./definitions/tokyo-night";

export const THEME_REGISTRY: readonly ThemeDefinition[] = [
  ...MARCODE_THEMES,
  ...CATPPUCCIN_THEMES,
  ...SOLARIZED_THEMES,
  ...DRACULA_THEMES,
  ...NORD_THEMES,
  ...ONE_DARK_THEMES,
  ...GITHUB_THEMES,
  ...GRUVBOX_THEMES,
  ...TOKYO_NIGHT_THEMES,
  ...ROSE_PINE_THEMES,
  ...AYU_THEMES,
  ...MONOKAI_THEMES,
];

export const THEME_MAP: ReadonlyMap<string, ThemeDefinition> = new Map(
  THEME_REGISTRY.map((t) => [t.id, t]),
);

export const THEME_GROUPS: readonly { group: ThemeGroup; label: string }[] = [
  { group: "marcode", label: "MarCode" },
  { group: "catppuccin", label: "Catppuccin" },
  { group: "solarized", label: "Solarized" },
  { group: "dracula", label: "Dracula" },
  { group: "nord", label: "Nord" },
  { group: "one-dark", label: "One Dark" },
  { group: "github", label: "GitHub" },
  { group: "gruvbox", label: "Gruvbox" },
  { group: "tokyo-night", label: "Tokyo Night" },
  { group: "rose-pine", label: "Ros\u00e9 Pine" },
  { group: "ayu", label: "Ayu" },
  { group: "monokai", label: "Monokai" },
];
