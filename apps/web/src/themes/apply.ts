import type { ThemeDefinition, ThemeVariables } from "./types";
import { THEME_MAP } from "./registry";

const ALL_VARIABLE_KEYS: ReadonlyArray<keyof ThemeVariables> = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--info",
  "--info-foreground",
  "--success",
  "--success-foreground",
  "--warning",
  "--warning-foreground",
];

export function applyThemeToDOM(theme: ThemeDefinition, suppressTransitions: boolean): void {
  const el = document.documentElement;

  if (suppressTransitions) {
    el.classList.add("no-transitions");
  }

  el.classList.toggle("dark", theme.base === "dark");

  if (theme.variables) {
    el.style.setProperty("color-scheme", theme.base);
    for (const key of ALL_VARIABLE_KEYS) {
      el.style.setProperty(key, theme.variables[key]);
    }
  } else {
    clearCustomVariables();
  }

  if (suppressTransitions) {
    // oxlint-disable-next-line no-unused-expressions
    el.offsetHeight;
    requestAnimationFrame(() => {
      el.classList.remove("no-transitions");
    });
  }
}

export function clearCustomVariables(): void {
  const el = document.documentElement;
  for (const key of ALL_VARIABLE_KEYS) {
    el.style.removeProperty(key);
  }
  el.style.removeProperty("color-scheme");
}

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolvePreference(preference: string, systemDark: boolean): ThemeDefinition {
  if (preference === "system") {
    return THEME_MAP.get(systemDark ? "marcode-dark" : "marcode-light")!;
  }
  return THEME_MAP.get(preference) ?? THEME_MAP.get("marcode-light")!;
}

export function resolvePreferenceFromSystem(preference: string): ThemeDefinition {
  return resolvePreference(preference, getSystemDark());
}
