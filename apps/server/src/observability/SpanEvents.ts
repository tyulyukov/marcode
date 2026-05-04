/**
 * SpanEvents - shared helpers for emitting structured span events.
 *
 * Wraps `Effect.currentSpan.event(...)` with the deny-list sanitizer so any
 * call site (orchestration decider, provider adapters, GitManager, ...) gets
 * a safe-by-default attribute payload.
 */
import { Effect } from "effect";

import { sanitizeAttributes } from "./Attributes.ts";

const nowUnixNano = (): bigint => BigInt(Date.now()) * 1_000_000n;

/**
 * recordSpanEvent - attach a named event to the current span.
 *
 * Silently no-ops if no span is active in the current Effect context (so it's
 * safe to call from anywhere without ceremony). Attributes are filtered through
 * `sanitizeAttributes` to drop deny-listed keys before emission.
 */
export const recordSpanEvent = (
  name: string,
  attributes: Readonly<Record<string, unknown>> = {},
): Effect.Effect<void> =>
  Effect.currentSpan.pipe(
    Effect.tap((span) =>
      Effect.sync(() => {
        span.event(name, nowUnixNano(), sanitizeAttributes(attributes));
      }),
    ),
    Effect.catch(() => Effect.void),
    Effect.asVoid,
  );

/**
 * annotateCurrentSpanSafe - annotate the current span with sanitized attributes.
 *
 * Drop-in for `Effect.annotateCurrentSpan(attrs)` that pre-filters denied keys.
 * Useful when callers may pass user-derived data that hasn't been pre-screened.
 */
export const annotateCurrentSpanSafe = (
  attributes: Readonly<Record<string, unknown>>,
): Effect.Effect<void> => Effect.annotateCurrentSpan(sanitizeAttributes(attributes));
