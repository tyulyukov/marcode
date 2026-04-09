# Fix Claude `[ede_diagnostic]` False Error Popups

> Upstream reference: [pingdotgg/t3code#1554](https://github.com/pingdotgg/t3code/pull/1554) by @Alexx999

## Summary

Fix two bugs in the Claude adapter that cause false red error popups in the UI. The Claude SDK emits `[ede_diagnostic]` entries (internal telemetry) in the `errors` array and can return results where `is_error === false` with a non-`"success"` subtype. Both cases were incorrectly classified as failures, surfacing cryptic diagnostic strings as user-facing error messages.

## Why

- Users see alarming red error popups containing raw `[ede_diagnostic]...` strings even though the agent turn completed successfully.
- The error popup text is meaningless to users — it's SDK-internal telemetry, not an actionable error.
- The false failure status can trigger downstream error-handling flows (error toasts, notification "Turn failed", retry prompts) when nothing actually went wrong.

## The Bug

### Root Cause 1: `turnStatusFromResult` ignores `is_error === false`

The function checked for specific error keywords (`"interrupted"`, `"cancel"`) but had no guard for the general `is_error === false` case. Any result with a non-`"success"` subtype that wasn't interrupted or cancelled fell through to `return "failed"`:

```ts
// BEFORE — fell through to "failed" even when is_error was false
function turnStatusFromResult(result: SDKResultMessage): ProviderRuntimeTurnStatus {
  const errors = result.errors ?? [];
  if (errors.some((e) => e.includes("interrupted"))) return "interrupted";
  if (errors.some((e) => e.includes("cancel"))) return "cancelled";
  return "failed"; // ← hit for non-error results too
}
```

### Root Cause 2: `handleResultMessage` blindly takes `errors[0]`

The error message extraction grabbed the first entry from the `errors` array without filtering. When the only entries were `[ede_diagnostic]` strings, those became the red popup text:

```ts
// BEFORE — blindly grabbed first error, including [ede_diagnostic] entries
const errorMessage = message.subtype === "success" ? undefined : message.errors[0];
```

## The Fix

### Fix 1: Guard `is_error === false`

```ts
// AFTER
function turnStatusFromResult(result: SDKResultMessage): ProviderRuntimeTurnStatus {
  const errors = result.errors ?? [];
  if (errors.some((e) => e.includes("interrupted"))) return "interrupted";
  if (errors.some((e) => e.includes("cancel"))) return "cancelled";
  if (result.is_error === false) {
    return "completed";
  }
  return "failed";
}
```

If the SDK explicitly says `is_error: false`, the turn is marked `"completed"` regardless of the `subtype` or contents of the `errors` array.

### Fix 2: Filter `[ede_diagnostic]` entries

```ts
// AFTER — skip SDK-internal diagnostics when picking the error message
const errorMessage =
  message.subtype === "success"
    ? undefined
    : message.errors.find((e: string) => !e.startsWith("[ede_diagnostic]"));
```

`Array.find` replaces `[0]` — returns the first **non-diagnostic** error string, or `undefined` if all entries are diagnostics. When `undefined`, downstream code falls back to a generic `"Claude turn failed."` message rather than showing a raw diagnostic string.

## What Are `[ede_diagnostic]` Events?

They are Claude SDK-internal diagnostic/telemetry messages. The `ede_` prefix indicates they come from an internal diagnostics subsystem. Key characteristics:

- They appear in the `errors` array of `SDKResultMessage`
- They are **not user-facing errors** — they're informational diagnostics the SDK emits alongside results
- They always start with the `[ede_diagnostic]` prefix
- They can appear even when `is_error === false` (successful turn)
- They contain internal state information that is meaningless to end users

## Before / After

| Scenario                                                                                     | Before                                                       | After                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Turn completes with `is_error: false`, non-`"success"` subtype, `[ede_diagnostic]` in errors | Red error popup: `"[ede_diagnostic] internal state dump..."` | Turn marked `"completed"`, no error shown                 |
| Turn completes with `is_error: false`, `[ede_diagnostic]` entries only                       | Status: `"failed"`, error toast fires                        | Status: `"completed"`, clean completion                   |
| Genuine error with real error message + `[ede_diagnostic]` entries                           | Shows `[ede_diagnostic]` string (wrong one)                  | Shows the real error message (first non-diagnostic entry) |
| Genuine error with only `[ede_diagnostic]` entries                                           | Shows `[ede_diagnostic]` string                              | Shows generic `"Claude turn failed."` fallback            |

## Implementation Notes for MarCode

- This is a tiny fix (+10/-1 lines) but has outsized impact on perceived reliability. Users trust the tool less when they see false errors.
- Check MarCode's `ClaudeAdapter` (or equivalent) for the same pattern — if `turnStatusFromResult` doesn't guard `is_error === false`, the same bug exists.
- The `[ede_diagnostic]` prefix filter is a pragmatic string check. If Claude SDK changes the prefix format, the filter may need updating — but the `is_error === false` guard is the primary defense.
- Consider logging filtered `[ede_diagnostic]` entries at debug level for troubleshooting, rather than silently dropping them.
- This fix also prevents false "Turn failed" OS notifications (from the notification feature) and false error states in the provider usage tracking.
