import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const COMPOSER_EDITOR_PATH = path.resolve(__dirname, "ComposerPromptEditor.tsx");
const JIRA_CHIP_PATH = path.resolve(__dirname, "chat/JiraTaskInlineChip.tsx");
const COMPOSER_MENU_PATH = path.resolve(__dirname, "chat/ComposerCommandMenu.tsx");
const CHATVIEW_PATH = path.resolve(__dirname, "ChatView.tsx");

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("Jira chip paste integration guard", () => {
  it("ComposerJiraPastePlugin handles PasteCommandType (not just ClipboardEvent)", () => {
    const src = readSource(COMPOSER_EDITOR_PATH);
    expect(src).toContain("PasteCommandType");
    expect(src).toContain("extractPlainTextFromPasteEvent");
    expect(src).toContain("event instanceof InputEvent");
    expect(src).toContain('event.dataTransfer?.getData("text/plain")');
  });

  it("ComposerJiraPastePlugin registers PASTE_COMMAND at CRITICAL priority", () => {
    const src = readSource(COMPOSER_EDITOR_PATH);
    expect(src).toContain("PASTE_COMMAND");
    expect(src).toContain("COMMAND_PRIORITY_CRITICAL");
    expect(src).toMatch(/editor\.registerCommand\(\s*PASTE_COMMAND/);
  });

  it("ComposerJiraPastePlugin registers COPY_COMMAND for Jira chip clipboard serialization", () => {
    const src = readSource(COMPOSER_EDITOR_PATH);
    expect(src).toContain("COPY_COMMAND");
    expect(src).toContain("$getSelectedTextWithJiraLabels");
    expect(src).toContain("formatJiraTaskInlineLabel");
  });

  it("JiraTaskInlineChip includes hidden @jira: prefix for clipboard copy", () => {
    const src = readSource(JIRA_CHIP_PATH);
    expect(src).toContain("JiraCopyPrefix");
    expect(src).toContain("@jira:");
  });

  it("onComposerJiraPaste callback has threadRef in dependency array", () => {
    const src = readSource(CHATVIEW_PATH);
    const jiraPasteDeps = src.match(/\[addComposerDraftJiraTaskContext.*?threadRef\]/s);
    expect(jiraPasteDeps).not.toBeNull();
    expect(jiraPasteDeps?.[0]).toContain("threadRef");
    expect(jiraPasteDeps?.[0]).not.toMatch(/threadId\]/);
  });

  it("ComposerCommandMenu does not render CommandList when items are empty", () => {
    const src = readSource(COMPOSER_MENU_PATH);
    expect(src).toMatch(/props\.items\.length\s*>\s*0\s*\?\s*\(\s*<CommandList/);
  });
});
