import { describe, expect, it } from "vitest";
import { THEME_REGISTRY, THEME_MAP, THEME_GROUPS } from "./registry";
import { resolvePreference } from "./apply";

describe("Theme registry and resolution", () => {
  it("THEME_REGISTRY has at least 24 themes", () => {
    expect(THEME_REGISTRY.length).toBeGreaterThanOrEqual(24);
  });

  it("THEME_REGISTRY includes all 12 groups", () => {
    const groups = new Set(THEME_REGISTRY.map((t) => t.group));
    const expectedGroups = [
      "marcode",
      "catppuccin",
      "solarized",
      "dracula",
      "nord",
      "one-dark",
      "github",
      "gruvbox",
      "tokyo-night",
      "rose-pine",
      "ayu",
      "monokai",
    ] as const;
    for (const g of expectedGroups) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it("THEME_MAP contains marcode-light and marcode-dark", () => {
    expect(THEME_MAP.has("marcode-light")).toBe(true);
    expect(THEME_MAP.has("marcode-dark")).toBe(true);
  });

  it("every theme has valid id, label, group, and base", () => {
    for (const theme of THEME_REGISTRY) {
      expect(typeof theme.id).toBe("string");
      expect(theme.id.length).toBeGreaterThan(0);
      expect(typeof theme.label).toBe("string");
      expect(theme.label.length).toBeGreaterThan(0);
      expect(typeof theme.group).toBe("string");
      expect(theme.group.length).toBeGreaterThan(0);
      expect(["light", "dark"]).toContain(theme.base);
    }
  });

  it("has no duplicate theme IDs", () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("THEME_GROUPS has 12 entries with marcode first", () => {
    expect(THEME_GROUPS).toHaveLength(12);
    expect(THEME_GROUPS[0]?.group).toBe("marcode");
  });

  it("resolvePreference with system preference and dark mode returns marcode-dark", () => {
    const theme = resolvePreference("system", true);
    expect(theme.id).toBe("marcode-dark");
  });

  it("resolvePreference with system preference and light mode returns marcode-light", () => {
    const theme = resolvePreference("system", false);
    expect(theme.id).toBe("marcode-light");
  });

  it("resolvePreference with a named theme returns that theme", () => {
    const theme = resolvePreference("catppuccin-mocha", false);
    expect(theme.id).toBe("catppuccin-mocha");
  });

  it("resolvePreference with unknown id falls back to marcode-light", () => {
    const theme = resolvePreference("nonexistent", false);
    expect(theme.id).toBe("marcode-light");
  });
});
