import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Per-component ticker. Each call mounts its own `setInterval`, so timers across
 * components drift relative to each other. Use {@link useSyncedRelativeTimeTick}
 * when multiple components need to refresh together.
 */
export function useRelativeTimeTick(intervalMs = 30_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

const SYNCED_INTERVAL_MS = 30_000;
let syncedNowMs = Date.now();
const syncedListeners = new Set<() => void>();
let syncedIntervalId: ReturnType<typeof setInterval> | null = null;

function subscribeSynced(listener: () => void): () => void {
  syncedListeners.add(listener);
  if (syncedIntervalId === null) {
    syncedNowMs = Date.now();
    syncedIntervalId = setInterval(() => {
      syncedNowMs = Date.now();
      for (const fn of syncedListeners) fn();
    }, SYNCED_INTERVAL_MS);
  }
  return () => {
    syncedListeners.delete(listener);
    if (syncedListeners.size === 0 && syncedIntervalId !== null) {
      clearInterval(syncedIntervalId);
      syncedIntervalId = null;
    }
  };
}

function getSyncedSnapshot(): number {
  return syncedNowMs;
}

/**
 * Shared 30s ticker. All components reading from this hook re-render on the same
 * interval and observe the same `nowMs`, so render-time relative labels stay in
 * agreement across the UI (e.g. sidebar thread row vs. chat header).
 */
export function useSyncedRelativeTimeTick(): number {
  return useSyncExternalStore(subscribeSynced, getSyncedSnapshot, getSyncedSnapshot);
}
