import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CHAT_DIR = path.resolve(__dirname);
const readCard = (filename: string) => fs.readFileSync(path.resolve(CHAT_DIR, filename), "utf-8");
const cardExists = (filename: string) => fs.existsSync(path.resolve(CHAT_DIR, filename));

describe("Work card component existence guards", () => {
  it("WebSearchCard exists and exports correctly", () => {
    expect(cardExists("WebSearchCard.tsx")).toBe(true);
    const content = readCard("WebSearchCard.tsx");
    expect(content).toContain("export const WebSearchCard");
  });

  it("WebFetchCard exists and exports correctly", () => {
    expect(cardExists("WebFetchCard.tsx")).toBe(true);
    const content = readCard("WebFetchCard.tsx");
    expect(content).toContain("export const WebFetchCard");
  });

  it("ExplorationCard exists and exports correctly", () => {
    expect(cardExists("ExplorationCard.tsx")).toBe(true);
    const content = readCard("ExplorationCard.tsx");
    expect(content).toContain("export const ExplorationCard");
  });

  it("CommandExecutionCard exists and exports correctly", () => {
    expect(cardExists("CommandExecutionCard.tsx")).toBe(true);
    const content = readCard("CommandExecutionCard.tsx");
    expect(content).toContain("export const CommandExecutionCard");
  });

  it("FileChangeCard exists and exports correctly", () => {
    expect(cardExists("FileChangeCard.tsx")).toBe(true);
    const content = readCard("FileChangeCard.tsx");
    expect(content).toContain("export const FileChangeCard");
  });

  it("McpToolCallCard exists and exports correctly", () => {
    expect(cardExists("McpToolCallCard.tsx")).toBe(true);
    const content = readCard("McpToolCallCard.tsx");
    expect(content).toContain("export const McpToolCallCard");
  });

  it("ProposedPlanCard exists and exports correctly", () => {
    expect(cardExists("ProposedPlanCard.tsx")).toBe(true);
    const content = readCard("ProposedPlanCard.tsx");
    expect(content).toContain("export const ProposedPlanCard");
  });

  it("AgentGroupCard exists and exports correctly", () => {
    expect(cardExists("AgentGroupCard.tsx")).toBe(true);
    const content = readCard("AgentGroupCard.tsx");
    expect(content).toContain("export const AgentGroupCard");
  });

  it("ChangedFilesTree exists and exports correctly", () => {
    expect(cardExists("ChangedFilesTree.tsx")).toBe(true);
    const content = readCard("ChangedFilesTree.tsx");
    expect(content).toContain("export const ChangedFilesTree");
  });
});
