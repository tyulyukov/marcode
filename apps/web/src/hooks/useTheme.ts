import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { ThemeDefinition, ThemePreference } from "../themes/types";
import { THEME_MAP } from "../themes/registry";
import { applyThemeToDOM, resolvePreference } from "../themes/apply";

type ThemeSnapshot = {
  preference: ThemePreference;
  systemDark: boolean;
};

const STORAGE_KEY = "marcode:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: string | null = null;
function emitChange() {
  for (const listener of listeners) listener();
}

function getSystemDark(): boolean {
  return window.matchMedia(MEDIA_QUERY).matches;
}

function getStored(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null || raw === "system") return "system";
  if (raw === "light") return "marcode-light";
  if (raw === "dark") return "marcode-dark";
  if (THEME_MAP.has(raw)) return raw;
  return "system";
}

function applyTheme(preference: ThemePreference, suppressTransitions = false) {
  const definition = resolvePreference(preference, getSystemDark());
  applyThemeToDOM(definition, suppressTransitions);
  syncDesktopTheme(definition, preference === "system");
}

function syncDesktopTheme(definition: ThemeDefinition, isSystem: boolean) {
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

applyTheme(getStored());

function getSnapshot(): ThemeSnapshot {
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

function subscribe(listener: () => void): () => void {
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
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const definition = resolvePreference(snapshot.preference, snapshot.systemDark);
  const resolvedTheme: "light" | "dark" = definition.base;

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next, true);
    emitChange();
  }, []);

  useEffect(() => {
    applyTheme(snapshot.preference);
  }, [snapshot.preference]);

  return {
    theme: snapshot.preference,
    activeTheme: definition,
    resolvedTheme,
    setTheme,
  } as const;
}
