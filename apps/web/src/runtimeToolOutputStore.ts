import { create } from "zustand";

const MAX_OUTPUT_CHARS_PER_ITEM = 24_000;
const MAX_ITEMS_PER_THREAD = 50;
const pendingDeltasByThreadId: Record<string, Record<string, string>> = {};
let scheduledFlush: ReturnType<typeof setTimeout> | number | null = null;

interface RuntimeToolOutputState {
  outputsByThreadId: Record<string, Record<string, string>>;
  appendOutput: (threadId: string, itemId: string, delta: string) => void;
  clearThread: (threadId: string) => void;
  clearAll: () => void;
}

function scheduleOutputFlush(flush: () => void): void {
  if (scheduledFlush !== null) return;
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    scheduledFlush = window.requestAnimationFrame(() => {
      scheduledFlush = null;
      flush();
    });
    return;
  }
  scheduledFlush = setTimeout(() => {
    scheduledFlush = null;
    flush();
  }, 16);
}

function cancelOutputFlush(): void {
  if (scheduledFlush === null) return;
  if (
    typeof window !== "undefined" &&
    typeof window.cancelAnimationFrame === "function" &&
    typeof scheduledFlush === "number"
  ) {
    window.cancelAnimationFrame(scheduledFlush);
  } else {
    clearTimeout(scheduledFlush);
  }
  scheduledFlush = null;
}

function takePendingDeltas(): Record<string, Record<string, string>> {
  const pending = { ...pendingDeltasByThreadId };
  for (const threadId of Object.keys(pendingDeltasByThreadId)) {
    delete pendingDeltasByThreadId[threadId];
  }
  return pending;
}

function appendPendingDelta(threadId: string, itemId: string, delta: string): void {
  const threadDeltas = (pendingDeltasByThreadId[threadId] ??= {});
  threadDeltas[itemId] = `${threadDeltas[itemId] ?? ""}${delta}`;
}

export const useRuntimeToolOutputStore = create<RuntimeToolOutputState>((set) => ({
  outputsByThreadId: {},

  appendOutput: (threadId, itemId, delta) => {
    if (delta.length === 0) return;
    appendPendingDelta(threadId, itemId, delta);
    scheduleOutputFlush(() => {
      const pending = takePendingDeltas();
      if (Object.keys(pending).length === 0) return;

      set((state) => {
        let outputsByThreadId = state.outputsByThreadId;
        let changed = false;

        for (const [pendingThreadId, itemDeltas] of Object.entries(pending)) {
          const threadOutputs = outputsByThreadId[pendingThreadId] ?? {};
          let nextThreadOutputs: Record<string, string> | null = null;

          for (const [pendingItemId, pendingDelta] of Object.entries(itemDeltas)) {
            const previous = threadOutputs[pendingItemId] ?? "";
            const next = `${previous}${pendingDelta}`;
            const trimmed =
              next.length > MAX_OUTPUT_CHARS_PER_ITEM
                ? next.slice(next.length - MAX_OUTPUT_CHARS_PER_ITEM)
                : next;

            if (trimmed === previous) continue;
            nextThreadOutputs ??= { ...threadOutputs };
            nextThreadOutputs[pendingItemId] = trimmed;
          }

          if (!nextThreadOutputs) continue;

          const keys = Object.keys(nextThreadOutputs);
          if (keys.length > MAX_ITEMS_PER_THREAD) {
            const evictCount = keys.length - MAX_ITEMS_PER_THREAD;
            for (let i = 0; i < evictCount; i++) {
              const evictKey = keys[i]!;
              if (!(evictKey in itemDeltas)) {
                delete nextThreadOutputs[evictKey];
              }
            }
          }

          if (!changed) {
            outputsByThreadId = Object.assign({}, outputsByThreadId);
            changed = true;
          }
          outputsByThreadId[pendingThreadId] = nextThreadOutputs;
        }

        return changed ? { outputsByThreadId } : state;
      });
    });
  },

  clearThread: (threadId) =>
    set((state) => {
      delete pendingDeltasByThreadId[threadId];
      if (!(threadId in state.outputsByThreadId)) return state;
      const { [threadId]: _, ...rest } = state.outputsByThreadId;
      return { outputsByThreadId: rest };
    }),

  clearAll: () => {
    cancelOutputFlush();
    for (const threadId of Object.keys(pendingDeltasByThreadId)) {
      delete pendingDeltasByThreadId[threadId];
    }
    set({ outputsByThreadId: {} });
  },
}));

export function useRuntimeToolOutput(
  threadId: string | undefined,
  itemId: string | undefined,
): string | undefined {
  return useRuntimeToolOutputStore((state) => {
    if (!threadId || !itemId) return undefined;
    return state.outputsByThreadId[threadId]?.[itemId];
  });
}
