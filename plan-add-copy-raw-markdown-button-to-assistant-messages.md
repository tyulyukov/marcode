# Plan: Add "Copy Raw Markdown" Button to Assistant Messages

## Context

Currently, user messages have a copy button (via `MessageCopyButton`) that appears on hover, but assistant messages have **no copy functionality**. The user wants to copy the raw markdown text of agent responses (before it gets rendered by `ChatMarkdown`).

## Approach

Add the existing `MessageCopyButton` component to assistant message rows in `MessagesTimeline.tsx`, following the same hover-to-reveal pattern used for user messages.

## Changes

### `apps/web/src/components/chat/MessagesTimeline.tsx`

In the assistant message rendering block (around line 371, after the changed files tree and before the metadata `<p>` tag):

1. Wrap the metadata line and the new copy button in a flex container with the same hover-reveal pattern used for user messages (`opacity-0 group-hover:opacity-100`).
2. The outer `<div className="min-w-0 px-1 py-0.5">` needs the `group` class added so child hover detection works.
3. Add `MessageCopyButton` with `text={messageText}` (the raw markdown string, defined at line 297).

**Before:**

```tsx
<div className="min-w-0 px-1 py-0.5">
  <ChatMarkdown ... />
  {/* changed files tree */}
  <p className="mt-1.5 text-[10px] text-muted-foreground/30">
    {/* timestamp + duration */}
  </p>
</div>
```

**After:**

```tsx
<div className="group min-w-0 px-1 py-0.5">
  <ChatMarkdown ... />
  {/* changed files tree */}
  <div className="mt-1.5 flex items-center gap-2">
    <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
      <MessageCopyButton text={messageText} />
    </div>
    <p className="text-[10px] text-muted-foreground/30">
      {/* timestamp + duration — unchanged */}
    </p>
  </div>
</div>
```

### Verify `MessageCopyButton` import

Already imported in `MessagesTimeline.tsx` (used for user messages). No new import needed.

## Verification

1. `bun fmt && bun lint && bun typecheck` must pass
2. Manual: hover over an assistant message -> copy button appears -> click it -> raw markdown is in clipboard (not rendered HTML)
