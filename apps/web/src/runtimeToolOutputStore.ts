import { create } from "zustand";

const MAX_OUTPUT_CHARS_PER_ITEM = 24_000;
const MAX_ITEMS_PER_THREAD = 50;

interface RuntimeToolOutputState {
  outputsByThreadId: Record<string, Record<string, string>>;
  appendOutput: (threadId: string, itemId: string, delta: string) => void;
  clearThread: (threadId: string) => void;
  clearAll: () => void;
}

export const useRuntimeToolOutputStore = create<RuntimeToolOutputState>((set) => ({
  outputsByThreadId: {},

  appendOutput: (threadId, itemId, delta) =>
    set((state) => {
      const threadOutputs = state.outputsByThreadId[threadId] ?? {};
      const previous = threadOutputs[itemId] ?? "";
      const next = `${previous}${delta}`;
      const trimmed =
        next.length > MAX_OUTPUT_CHARS_PER_ITEM
          ? next.slice(next.length - MAX_OUTPUT_CHARS_PER_ITEM)
          : next;
      let nextThreadOutputs = { ...threadOutputs, [itemId]: trimmed };
      const keys = Object.keys(nextThreadOutputs);
      if (keys.length > MAX_ITEMS_PER_THREAD) {
        const evictCount = keys.length - MAX_ITEMS_PER_THREAD;
        for (let i = 0; i < evictCount; i++) {
          const evictKey = keys[i]!;
          if (evictKey !== itemId) {
            delete nextThreadOutputs[evictKey];
          }
        }
      }
      return {
        outputsByThreadId: {
          ...state.outputsByThreadId,
          [threadId]: nextThreadOutputs,
        },
      };
    }),

  clearThread: (threadId) =>
    set((state) => {
      if (!(threadId in state.outputsByThreadId)) return state;
      const { [threadId]: _, ...rest } = state.outputsByThreadId;
      return { outputsByThreadId: rest };
    }),

  clearAll: () => set({ outputsByThreadId: {} }),
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
