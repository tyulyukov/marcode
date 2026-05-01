import { afterEach, describe, expect, it, vi } from "vitest";

import { useRuntimeToolOutputStore } from "./runtimeToolOutputStore";

describe("runtimeToolOutputStore", () => {
  afterEach(() => {
    useRuntimeToolOutputStore.getState().clearAll();
    vi.useRealTimers();
  });

  it("coalesces multiple command output deltas into one store update", () => {
    vi.useFakeTimers();
    const notifications: unknown[] = [];
    const unsubscribe = useRuntimeToolOutputStore.subscribe((state) => {
      notifications.push(state.outputsByThreadId);
    });

    useRuntimeToolOutputStore.getState().appendOutput("thread-1", "cmd-1", "a");
    useRuntimeToolOutputStore.getState().appendOutput("thread-1", "cmd-1", "b");
    useRuntimeToolOutputStore.getState().appendOutput("thread-1", "cmd-1", "c");

    expect(useRuntimeToolOutputStore.getState().outputsByThreadId).toEqual({});
    expect(notifications).toHaveLength(0);

    vi.advanceTimersByTime(16);

    expect(useRuntimeToolOutputStore.getState().outputsByThreadId["thread-1"]?.["cmd-1"]).toBe(
      "abc",
    );
    expect(notifications).toHaveLength(1);

    unsubscribe();
  });

  it("drops queued command output when a thread is cleared before flush", () => {
    vi.useFakeTimers();

    useRuntimeToolOutputStore.getState().appendOutput("thread-1", "cmd-1", "queued");
    useRuntimeToolOutputStore.getState().clearThread("thread-1");
    vi.advanceTimersByTime(16);

    expect(useRuntimeToolOutputStore.getState().outputsByThreadId["thread-1"]).toBeUndefined();
  });
});
