# Inline User Message Editing

> Upstream reference: [pingdotgg/t3code#1683](https://github.com/pingdotgg/t3code/pull/1683) by @ChrisLally

## Summary

Allow users to edit previously sent messages directly in the timeline without leaving the conversation flow. Clicking "Edit" on a user bubble opens an inline editor, and submitting silently reverts to that checkpoint then re-sends the modified message as a new turn.

## Why

- **Revert** drops everything after a point with no follow-up. Users usually want to _fix the prompt and retry_ (issue [#331](https://github.com/pingdotgg/t3code/issues/331)).
- Eliminates the copy-paste-revert-retype cycle that breaks flow.
- The main composer draft stays untouched during the edit — no accidental loss of in-progress work.

## User Flow

1. Hover a user message bubble in the timeline.
2. A pencil icon appears next to the existing Revert (undo) button. It is only visible when the message has an associated checkpoint (i.e., `revertTurnCountByUserMessageId` has an entry).
3. Click the pencil — the bubble transforms into an inline `<Textarea>` pre-filled with the original text. Attached images appear as removable thumbnails. An "Add image" button allows attaching new images.
4. Edit the text, add/remove images.
5. **Submit** (Cmd/Ctrl+Enter or Send button):
   - Silently reverts to the checkpoint (no confirmation dialog).
   - Waits for the server to process the revert (original message disappears from store).
   - Sends the edited content as a new turn.
   - Discards the edit session; the main composer is untouched.
6. **Cancel** (Escape or Cancel button): discards local edits, returns to display mode.

## Architecture

### State

```
ChatView.tsx
├── editingUserMessageId: MessageId | null
├── editingUserMessageText: string
├── editingUserMessageImages: ComposerImageAttachment[]
└── userMessageEditSessionRef: useRef<number>   // stale-async guard (incremented on each edit start)
```

### Key Functions

#### `onStartEditUserMessage(message)`

1. Increment `userMessageEditSessionRef` (session counter for stale detection).
2. Set `editingUserMessageId`.
3. Strip inline terminal/jira context placeholders from message text via `deriveDisplayedUserMessageState`.
4. Re-hydrate image attachments by fetching blobs from their `previewUrl`:

```ts
async function materializeMessageImageAttachmentForEdit(
  attachment: ChatImageAttachment,
): Promise<ComposerImageAttachment | null> {
  const response = await fetch(attachment.previewUrl);
  const blob = await response.blob();
  const file = new File([blob], attachment.name, { type: attachment.mimeType });
  const previewUrl = URL.createObjectURL(blob);
  return { id: attachment.id, file, name: attachment.name, previewUrl };
}
```

5. If the session counter still matches after async work, set `editingUserMessageImages`.

#### `submitComposerTurn(input)` — extracted from `onSend`

Accepts a `clearComposerDraft` boolean. The edit path calls it with `false` so the real composer state is preserved. The normal send path calls it with `true`.

#### `onSubmitEditUserMessage(message)`

```
1. Look up targetTurnCount from revertTurnCountByUserMessageId
2. Call onRevertToTurnCount(targetTurnCount, { confirm: false })  // skip dialog
3. Await waitForThreadMessageRemoval(threadId, messageId, 3000ms)
4. Call submitComposerTurn({ ..., clearComposerDraft: false })
5. If successful, call discardUserMessageEditSession()
```

#### `waitForThreadMessageRemoval(threadId, messageId, timeoutMs)`

Subscribes to the Zustand store and resolves when the message disappears from the thread's message array, or after `timeoutMs` (3s fallback to prevent UI hang if the server is slow).

### Component: `EditableUserMessageTimelineRow`

A `memo`'d component that switches between display mode (bubble + copy/edit/revert buttons) and edit mode (textarea + image controls).

```tsx
// Edit mode rendering
<Textarea
  rows={Math.max(3, Math.min(10, lineCount + 1))}
  value={editingText}
  onChange={(e) => onEditingTextChange(e.target.value)}
  onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit();
    if (e.key === "Escape") onCancel();
  }}
  autoFocus
/>;
{
  /* Image grid with X overlay buttons */
}
{
  /* Hidden <input type="file"> for adding images */
}
{
  /* Cancel / Send buttons — disabled while isBusy or content is empty */
}
```

## Edge Cases

| Case                                                                 | Handling                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stale async (user starts editing another message before images load) | `userMessageEditSessionRef` counter — stale results are discarded   |
| Server slow to process revert                                        | `waitForThreadMessageRemoval` proceeds after 3s timeout             |
| Main composer has unsaved work                                       | `clearComposerDraft: false` preserves the real composer entirely    |
| Thread switch during edit                                            | `useEffect` cleanup calls `discardUserMessageEditSession()`         |
| Expanded image overlay open during edit                              | Also triggers cleanup/discard                                       |
| Image memory leaks                                                   | `URL.revokeObjectURL()` called on removed images and on discard     |
| Terminal/Jira context placeholders in original text                  | Stripped before populating the textarea                             |
| Empty message after editing                                          | Submit button disabled; handler has an early return guard           |
| Agent currently working                                              | Both Cancel and Send are disabled while `isWorking \|\| isSendBusy` |

## Implementation Notes for MarCode

- Extract `submitComposerTurn` from the existing `onSend` handler — this is the key refactor that enables both normal sends and edit re-sends through one path.
- The edit button should only appear on messages with a checkpoint (`revertTurnCountByUserMessageId.has(message.id)`).
- Consider adding the edit session state to a separate Zustand slice or context to avoid bloating `ChatView.tsx` further.
- The `confirm: false` option on `onRevertToTurnCount` should be a new parameter, not a separate function.
