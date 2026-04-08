# Live Command Output Streaming

> Upstream reference: [pingdotgg/t3code#1665](https://github.com/pingdotgg/t3code/pull/1665) by @sethigeet

## Summary

Stream terminal command output (stdout/stderr) into the work log UI in real-time while commands execute. Output is ephemeral (in-memory only, never persisted to the database), providing immediate visibility into long-running operations like test suites, builds, and benchmarks without storage overhead.

## Why

- Users currently see "Working..." with no indication of what is happening inside long-running commands.
- Visibility into live output is critical for builds, test suites, linters, and benchmarks that can take minutes.
- Mirrors the experience of Claude Code's terminal, where users can watch output scroll by.
- In-memory-only design avoids bloating the database with megabytes of ephemeral stdout.

## User Flow

1. Agent starts executing a terminal command (e.g., `bun run test`).
2. The work log entry appears immediately (even before the command completes) with a "Show output" toggle.
3. Clicking "Show output" reveals a scrollable monospace `<pre>` block with live-streaming content.
4. Output updates in real-time as new deltas arrive via WebSocket.
5. When the command completes, the output remains available for the rest of the session.
6. On turn start or thread deletion, the output buffer is cleared.

## Architecture

### Data Flow

```
Provider Runtime (stdio)
  │ content.delta event (streamKind: "command_output")
  ▼
Server ProviderService.streamEvents
  │ Filter: type === "content.delta" && streamKind === "command_output"
  │ NOT persisted to activities DB
  ▼
WebSocket push (subscribeProviderRuntimeToolOutputEvents)
  │ Stream<ProviderRuntimeEvent>
  ▼
Client __root.tsx subscription
  │ appendOutput(threadId, itemId, delta)
  ▼
runtimeToolOutputStore (Zustand, in-memory)
  │ outputsByThreadId[threadId][itemId] = accumulated string
  ▼
ChatView.tsx
  │ mergeRuntimeOutputIntoWorkLogEntries()
  ▼
MessagesTimeline work log entry with collapsible output
```

### Zustand Store: `runtimeToolOutputStore`

```ts
const MAX_OUTPUT_CHARS_PER_ITEM = 24_000;

interface RuntimeToolOutputState {
  outputsByThreadId: Record<ThreadId, Record<ItemId, string>>;
  appendOutput: (threadId: ThreadId, itemId: string, delta: string) => void;
  clearThread: (threadId: ThreadId) => void;
  clearAll: () => void;
}

// Rolling window: when accumulated output exceeds MAX_OUTPUT_CHARS_PER_ITEM,
// the oldest bytes are dropped (keeps the tail).
const next = `${previous}${delta}`;
return next.length > MAX_OUTPUT_CHARS_PER_ITEM
  ? next.slice(next.length - MAX_OUTPUT_CHARS_PER_ITEM)
  : next;
```

### New WebSocket RPC Method

```ts
// packages/contracts/src/rpc.ts
export const WsSubscribeProviderRuntimeToolOutputEventsRpc = Rpc.make(
  WS_METHODS.subscribeProviderRuntimeToolOutputEvents,
  {
    payload: Schema.Struct({}),
    success: ProviderRuntimeEvent,
    stream: true,
  },
);
```

### Server Handler

```ts
// apps/server/src/ws.ts
[WS_METHODS.subscribeProviderRuntimeToolOutputEvents]: (_input) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const providerService = yield* ProviderService;
      return providerService.streamEvents.pipe(
        Stream.filter(
          (event) =>
            event.type === "content.delta" &&
            event.payload.streamKind === "command_output",
        ),
      );
    }),
  ),
```

### Client Subscription (`__root.tsx`)

```ts
const runtimeToolOutputStore = useRuntimeToolOutputStore.getState();
runtimeToolOutputStore.clearAll();

const unsubRuntimeToolOutputEvent = api.orchestration.onRuntimeToolOutputEvent((event) => {
  if (
    event.type !== "content.delta" ||
    event.payload.streamKind !== "command_output" ||
    !event.itemId
  )
    return;

  runtimeToolOutputStore.appendOutput(event.threadId, event.itemId, event.payload.delta);
});
```

### Work Log Merge (`session-logic.ts`)

Split `deriveWorkLogEntries` into two stages:

1. `deriveBaseWorkLogEntries(activities, turnId)` — pure derivation from persisted activities. Now includes `tool.started` entries for `command_execution` so live output can attach before completion.
2. `mergeRuntimeOutputIntoWorkLogEntries(entries, runtimeOutputByItemId)` — injects live output by matching `itemId`:

```ts
function mergeRuntimeOutputIntoWorkLogEntries(
  entries: ReadonlyArray<RuntimeAttachableWorkLogEntry>,
  runtimeOutputByItemId: ReadonlyMap<string, string>,
): WorkLogEntry[] {
  return entries.map(({ itemId, ...entry }) => {
    if (!itemId || !runtimeOutputByItemId.has(itemId)) return entry;
    return Object.assign(entry, { output: runtimeOutputByItemId.get(itemId) });
  });
}
```

### UI Component (`MessagesTimeline.tsx`)

```tsx
// Inside SimpleWorkEntryRow
const [outputExpanded, setOutputExpanded] = useState(false);
const hasOutput = typeof workEntry.output === "string" && workEntry.output.length > 0;

{
  hasOutput && (
    <div className="mt-1 pl-6">
      <button
        type="button"
        className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65"
        onClick={() => setOutputExpanded((prev) => !prev)}
      >
        {outputExpanded ? "Hide output" : "Show output"}
      </button>
      {outputExpanded && (
        <pre className="mt-1 max-h-56 overflow-auto rounded-md border font-mono text-[10px] whitespace-pre-wrap break-words">
          {workEntry.output}
        </pre>
      )}
    </div>
  );
}
```

## Edge Cases

| Case                                  | Handling                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Output exceeds 24K chars              | Rolling window — oldest bytes dropped, keeps the tail                      |
| Turn starts (new agent work)          | `clearThread()` triggered via `thread.turn-start-requested` event          |
| Reconnect / welcome                   | `clearAll()` on subscription setup                                         |
| Command running but not yet completed | `tool.started` for `command_execution` is now included in work log entries |
| No `itemId` on legacy events          | Graceful skip — `!event.itemId` guard in subscription                      |
| Multiple concurrent commands          | Each has a unique `itemId`; output accumulates independently per item      |
| Thread deleted                        | `clearThread()` on thread deletion event                                   |

## Implementation Notes for MarCode

- The key insight is that `content.delta` events with `streamKind === "command_output"` are already flowing through the provider runtime — they just need to be tapped and routed to a client-side store instead of being discarded.
- The 24K rolling window is a good default — adjust based on real-world usage patterns.
- Consider auto-expanding output for actively running commands and auto-collapsing on completion.
- The `tool.started` → `tool.completed` collapse logic needs careful handling of `itemId` threading to avoid output attaching to the wrong entry.
