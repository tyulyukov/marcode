import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname);
const readSrc = (relativePath: string) =>
  fs.readFileSync(path.resolve(SRC_DIR, relativePath), "utf-8");
const fileExists = (relativePath: string) =>
  fs.existsSync(path.resolve(SRC_DIR, relativePath));

describe("Server feature existence guards", () => {
  it("GitLab CLI implementation exists", () => {
    const content = readSrc("git/Layers/GitLabCli.ts");
    expect(content).toContain("makeGitLabCliShape");
  });

  it("RoutingGitHostCli exists", () => {
    expect(fileExists("git/Layers/RoutingGitHostCli.ts")).toBe(true);
    const content = readSrc("git/Layers/RoutingGitHostCli.ts");
    expect(content.toLowerCase()).toContain("github");
    expect(content.toLowerCase()).toContain("gitlab");
  });

  it("Claude text generation exists", () => {
    expect(fileExists("git/Layers/ClaudeTextGeneration.ts")).toBe(true);
  });

  it("RoutingTextGeneration exists", () => {
    expect(fileExists("git/Layers/RoutingTextGeneration.ts")).toBe(true);
  });

  it("Jira module exists", () => {
    const jiraDir = path.resolve(SRC_DIR, "jira");
    expect(fs.existsSync(jiraDir)).toBe(true);
    const files = fs.readdirSync(jiraDir, { recursive: true }) as string[];
    const tsFiles = files.filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it("Claude provider uses 'Opus 4.6' display name", () => {
    const content = readSrc("provider/Layers/ClaudeProvider.ts");
    expect(content).toContain('"Opus 4.6"');
  });

  it("Default effort is medium for Opus", () => {
    const content = readSrc("provider/Layers/ClaudeProvider.ts");
    const lines = content.split("\n");
    const mediumDefaultLine = lines.find(
      (line) => line.includes("medium") && line.includes("isDefault"),
    );
    expect(mediumDefaultLine).toBeDefined();
  });

  it("No PostHog/analytics service imports", () => {
    const filesToCheck = [
      "bootstrap.ts",
      "http.ts",
      "provider/Layers/ClaudeProvider.ts",
      "provider/Layers/ClaudeAdapter.ts",
      "provider/Layers/ProviderRegistry.ts",
      "provider/Layers/ProviderService.ts",
    ];

    for (const file of filesToCheck) {
      if (!fileExists(file)) continue;
      const content = readSrc(file);
      expect(content).not.toMatch(/import.*posthog/i);
    }
  });
});
