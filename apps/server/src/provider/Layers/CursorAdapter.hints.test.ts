import { describe, expect, it } from "vitest";

import { TurnId } from "@marcode/contracts";

import {
  applyToolCallHint,
  resolveEffectiveTurnId,
  resolveTerminalHintFromToolCall,
} from "./CursorAdapter.ts";
import type { AcpToolCallState } from "../acp/AcpRuntimeModel.ts";

// Cursor ACP only emits the real command text in `session/request_permission`
// (the title is backtick-wrapped, e.g. `` `rg -i 'effect'` ``). The subsequent
// `session/update` tool_call just says `title: "Terminal"` with empty
// `rawInput`. The adapter stashes the permission-request command and merges it
// into the tool_call state via `applyToolCallHint` — without this the user
// only sees a blank "Ran command" pill.
describe("applyToolCallHint", () => {
  const baseState: AcpToolCallState = {
    toolCallId: "tool-1",
    kind: "execute",
    title: "Ran command",
    status: "inProgress",
    data: { toolCallId: "tool-1", kind: "execute", toolName: "execute", rawInput: {} },
  };

  it("returns the state unchanged when no hint is present", () => {
    expect(applyToolCallHint(baseState, undefined)).toBe(baseState);
  });

  it("fills in the command when the tool_call state lacks one", () => {
    const merged = applyToolCallHint(baseState, { command: "rg -i 'effect' --stats" });
    expect(merged.command).toBe("rg -i 'effect' --stats");
    expect(merged.data.command).toBe("rg -i 'effect' --stats");
  });

  // Critical: detail is reserved for stdout/stderr output. If we populated
  // detail with the command text, CommandExecutionCard's duplicate guard would
  // suppress the stdout body because detail === command. Keep it untouched.
  it("never writes the command into `detail` even when detail was empty", () => {
    const merged = applyToolCallHint(baseState, { command: "rg -i 'effect' --stats" });
    expect(merged.detail).toBeUndefined();
  });

  it("does not overwrite an existing command", () => {
    const stateWithCommand: AcpToolCallState = {
      ...baseState,
      command: "bun run lint",
      detail: "bun run lint",
      data: { ...baseState.data, command: "bun run lint" },
    };
    const merged = applyToolCallHint(stateWithCommand, { command: "different command" });
    expect(merged.command).toBe("bun run lint");
    expect(merged.data.command).toBe("bun run lint");
  });

  it("preserves any existing detail (which represents output, not command)", () => {
    const stateWithDetail: AcpToolCallState = {
      ...baseState,
      detail: "existing output",
    };
    const merged = applyToolCallHint(stateWithDetail, { command: "ls" });
    expect(merged.command).toBe("ls");
    expect(merged.detail).toBe("existing output");
  });
});

// When Cursor advertises `terminal: true`, it issues a `terminal/create`
// request that carries the real command + args. The adapter stashes the
// spawned terminal keyed by terminalId, and subsequent `session/update`
// tool_call events reference that terminalId in `data.content` via
// `{ type: "terminal", terminalId }`. `resolveTerminalHintFromToolCall`
// bridges those two channels: it returns a hint with the captured command so
// `applyToolCallHint` can merge it into the tool_call state.
describe("resolveTerminalHintFromToolCall", () => {
  const terminalState: AcpToolCallState = {
    toolCallId: "tool-terminal-1",
    kind: "execute",
    title: "Ran command",
    status: "inProgress",
    data: {
      toolCallId: "tool-terminal-1",
      kind: "execute",
      toolName: "execute",
      content: [{ type: "terminal", terminalId: "t-1" }],
    },
  };

  it("returns undefined when the tool_call has no terminal content ref", () => {
    expect(
      resolveTerminalHintFromToolCall(
        { ...terminalState, data: { ...terminalState.data, content: [] } },
        new Map([["t-1", { command: "cc --version" }]]),
      ),
    ).toBeUndefined();
  });

  it("returns undefined when the terminalId is not in the terminals map", () => {
    expect(resolveTerminalHintFromToolCall(terminalState, new Map())).toBeUndefined();
  });

  it("returns the stored command when the tool_call references a known terminal", () => {
    const hint = resolveTerminalHintFromToolCall(
      terminalState,
      new Map([["t-1", { command: "cc --version" }]]),
    );
    expect(hint).toEqual({ command: "cc --version" });
  });

  it("composes with applyToolCallHint to populate the command on the tool_call state", () => {
    const hint = resolveTerminalHintFromToolCall(
      terminalState,
      new Map([["t-1", { command: "bun run typecheck" }]]),
    );
    const merged = applyToolCallHint(terminalState, hint);
    expect(merged.command).toBe("bun run typecheck");
    expect(merged.data.command).toBe("bun run typecheck");
  });
});

// Cursor fires `cursor/task` as a fire-and-forget notification after the
// subagent run completes. Depending on timing, `ctx.activeTurnId` may still be
// the turn that just ended, or may be undefined (e.g. if another code path
// cleared it, or if the notification arrives between turns). Either way the
// session-logic filter drops activities whose `turnId !== latestTurnId`, so
// falling back to the last known turn prevents the subagent work from being
// silently swallowed by the UI.
describe("resolveEffectiveTurnId", () => {
  const turnA = TurnId.make("11111111-1111-1111-1111-111111111111");
  const turnB = TurnId.make("22222222-2222-2222-2222-222222222222");

  it("returns undefined when no ctx is provided", () => {
    expect(resolveEffectiveTurnId(undefined)).toBeUndefined();
  });

  it("prefers the active turn when one is set", () => {
    expect(resolveEffectiveTurnId({ activeTurnId: turnA, turns: [] })).toBe(turnA);
    expect(
      resolveEffectiveTurnId({
        activeTurnId: turnA,
        turns: [{ id: turnB }],
      }),
    ).toBe(turnA);
  });

  it("falls back to the last known turn when activeTurnId is undefined", () => {
    expect(
      resolveEffectiveTurnId({
        activeTurnId: undefined,
        turns: [{ id: turnA }, { id: turnB }],
      }),
    ).toBe(turnB);
  });

  it("returns undefined when there's no active turn and no known turns", () => {
    expect(
      resolveEffectiveTurnId({
        activeTurnId: undefined,
        turns: [],
      }),
    ).toBeUndefined();
  });
});
