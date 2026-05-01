import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { ThemeDefinition, ThemePreference } from "../themes/types";
import { THEME_MAP } from "../themes/registry";
import { applyThemeToDOM, resolvePreference, type AutoNightPair } from "../themes/apply";
import { getClientSettings, useSettings } from "./useSettings";

type ThemeSnapshot = {
  preference: ThemePreference;
  systemDark: boolean;
};

const STORAGE_KEY = "marcode:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  preference: "system",
  systemDark: false,
};
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: string | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function hasThemeStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches;
}

function getStored(): ThemePreference {
  if (!hasThemeStorage()) return DEFAULT_THEME_SNAPSHOT.preference;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null || raw === "system") return "system";
  if (raw === "light") return "marcode-light";
  if (raw === "dark") return "marcode-dark";
  if (THEME_MAP.has(raw)) return raw;
  return "system";
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>(DYNAMIC_THEME_COLOR_SELECTOR);
  if (element) {
    return element;
  }

  element = document.createElement("meta");
  element.name = THEME_COLOR_META_NAME;
  element.setAttribute("data-dynamic-theme-color", "true");
  document.head.append(element);
  return element;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return null;
  }

  return value?.trim() ?? null;
}

function resolveBrowserChromeSurface(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']") ??
    document.querySelector<HTMLElement>("[data-slot='sidebar-inner']") ??
    document.body
  );
}

export function syncBrowserChromeTheme() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return;
  const surfaceColor = normalizeThemeColor(
    getComputedStyle(resolveBrowserChromeSurface()).backgroundColor,
  );
  const fallbackColor = normalizeThemeColor(getComputedStyle(document.body).backgroundColor);
  const backgroundColor = surfaceColor ?? fallbackColor;
  if (!backgroundColor) return;

  document.documentElement.style.backgroundColor = backgroundColor;
  document.body.style.backgroundColor = backgroundColor;
  ensureThemeColorMetaTag().setAttribute("content", backgroundColor);
}

function getAutoNightPair(): AutoNightPair {
  const settings = getClientSettings();
  return { light: settings.autoNightLightTheme, dark: settings.autoNightDarkTheme };
}

export function computeAccentForeground(hex: string): string {
  const trimmed = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((c) => c + c)
          .join("")
      : trimmed;
  if (expanded.length !== 6) return "#f9fdfd";
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#f9fdfd";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#222222" : "#f9fdfd";
}

function applyAccentOverride(definition: ThemeDefinition) {
  if (typeof document === "undefined") return;
  const settings = getClientSettings();
  const accent = settings.accentOverride;
  const html = document.documentElement;

  if (accent) {
    html.style.setProperty("--primary", accent);
    html.style.setProperty("--primary-foreground", computeAccentForeground(accent));
    html.style.setProperty("--ring", accent);
    return;
  }

  // Restore the theme's own primary (or remove the override so CSS-rule
  // defaults apply for marcode themes that do not declare variables).
  if (definition.variables) {
    html.style.setProperty("--primary", definition.variables["--primary"]);
    html.style.setProperty("--primary-foreground", definition.variables["--primary-foreground"]);
    html.style.setProperty("--ring", definition.variables["--ring"]);
  } else {
    html.style.removeProperty("--primary");
    html.style.removeProperty("--primary-foreground");
    html.style.removeProperty("--ring");
  }
}

function applyTheme(preference: ThemePreference, suppressTransitions = false) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const definition = resolvePreference(preference, getSystemDark(), getAutoNightPair());
  applyThemeToDOM(definition, suppressTransitions);
  applyAccentOverride(definition);
  syncBrowserChromeTheme();
  syncDesktopTheme(definition, preference === "system");
}

export function reapplyCurrentTheme(suppressTransitions = true): void {
  applyTheme(getStored(), suppressTransitions);
}

function syncDesktopTheme(definition: ThemeDefinition, isSystem: boolean) {
  if (typeof window === "undefined") return;
  const bridge = window.desktopBridge;
  const desktopTheme = isSystem ? "system" : definition.base;
  if (!bridge || lastDesktopTheme === desktopTheme) {
    return;
  }

  lastDesktopTheme = desktopTheme;
  void bridge.setTheme(desktopTheme).catch(() => {
    if (lastDesktopTheme === desktopTheme) {
      lastDesktopTheme = null;
    }
  });
}

if (typeof document !== "undefined" && hasThemeStorage()) {
  applyTheme(getStored());
}

function getSnapshot(): ThemeSnapshot {
  if (!hasThemeStorage()) return DEFAULT_THEME_SNAPSHOT;
  const preference = getStored();
  const systemDark = preference === "system" ? getSystemDark() : false;

  if (
    lastSnapshot &&
    lastSnapshot.preference === preference &&
    lastSnapshot.systemDark === systemDark
  ) {
    return lastSnapshot;
  }

  lastSnapshot = { preference, systemDark };
  return lastSnapshot;
}

function getServerSnapshot() {
  return DEFAULT_THEME_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  const mq = window.matchMedia(MEDIA_QUERY);
  const handleChange = () => {
    if (getStored() === "system") applyTheme("system", true);
    emitChange();
  };
  mq.addEventListener("change", handleChange);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      applyTheme(getStored(), true);
      emitChange();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    mq.removeEventListener("change", handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const autoNightLightTheme = useSettings((s) => s.autoNightLightTheme);
  const autoNightDarkTheme = useSettings((s) => s.autoNightDarkTheme);
  const pair = useMemo<AutoNightPair>(
    () => ({ light: autoNightLightTheme, dark: autoNightDarkTheme }),
    [autoNightDarkTheme, autoNightLightTheme],
  );
  const definition = resolvePreference(snapshot.preference, snapshot.systemDark, pair);
  const resolvedTheme: "light" | "dark" = definition.base;

  const setTheme = useCallback((next: ThemePreference) => {
    if (!hasThemeStorage()) return;
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next, true);
    emitChange();
  }, []);

  useEffect(() => {
    applyTheme(snapshot.preference);
  }, [snapshot.preference, pair.light, pair.dark]);

  return {
    theme: snapshot.preference,
    activeTheme: definition,
    resolvedTheme,
    setTheme,
  } as const;
}
