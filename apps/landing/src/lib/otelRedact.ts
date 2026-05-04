/**
 * OTLP body redactor.
 *
 * Walks the standard OTLP/JSON shape and drops attribute entries whose key
 * matches a deny-list of suffixes. Mirrors the server-side
 * `OTEL_DENY_SUFFIXES` in `apps/server/src/observability/Attributes.ts` so
 * sensitive data has two lines of defense.
 */
export const OTEL_DENY_SUFFIXES: ReadonlyArray<string> = [
  "cwd",
  "path",
  "file_path",
  "filename",
  "directory",
  "command_line",
  "argv",
  "cmdline",
  "body",
  "content",
  "text",
  "message_text",
  "prompt",
  "completion",
  "diff",
  "patch",
  "email",
  "username",
  "account_id",
  "url",
  "token",
  "secret",
  "key",
  "password",
  "authorization",
  "title",
  "summary",
  "description",
];

export function isDeniedAttributeKey(key: string): boolean {
  for (const suffix of OTEL_DENY_SUFFIXES) {
    if (key === suffix || key.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

interface OtlpKeyValue {
  key: string;
  value?: unknown;
}

function filterAttributes(attrs: unknown): OtlpKeyValue[] {
  if (!Array.isArray(attrs)) return [];
  return (attrs as OtlpKeyValue[]).filter(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.key === "string" &&
      !isDeniedAttributeKey(entry.key),
  );
}

interface OtlpSpan {
  attributes?: OtlpKeyValue[];
  events?: Array<{ attributes?: OtlpKeyValue[] }>;
}

interface OtlpScopeSpans {
  spans?: OtlpSpan[];
}

interface OtlpResource {
  attributes?: OtlpKeyValue[];
}

interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
}

export interface OtlpTraceBody {
  resourceSpans?: OtlpResourceSpans[];
}

/**
 * redactOtlpBody - mutates and returns the body with deny-listed attributes
 * removed from resource, span, and span event attribute arrays.
 */
export function redactOtlpBody(body: OtlpTraceBody): OtlpTraceBody {
  for (const rs of body.resourceSpans ?? []) {
    if (rs.resource) {
      rs.resource.attributes = filterAttributes(rs.resource.attributes);
    }
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        span.attributes = filterAttributes(span.attributes);
        for (const event of span.events ?? []) {
          event.attributes = filterAttributes(event.attributes);
        }
      }
    }
  }
  return body;
}

/**
 * upsertResourceAttribute - inserts or replaces a key/value entry on every
 * resourceSpans[i].resource.attributes. Used to OVERRIDE `service.name` and
 * stamp `user.is_genesis`/`ingest.client_ip_hash` server-side regardless of
 * what the client sent.
 */
export function upsertResourceAttribute(
  body: OtlpTraceBody,
  key: string,
  value: { stringValue?: string; boolValue?: boolean; intValue?: string },
): void {
  for (const rs of body.resourceSpans ?? []) {
    rs.resource = rs.resource ?? { attributes: [] };
    const attrs: OtlpKeyValue[] = Array.isArray(rs.resource.attributes)
      ? rs.resource.attributes
      : [];
    const existingIndex = attrs.findIndex((entry) => entry.key === key);
    const next: OtlpKeyValue = { key, value };
    if (existingIndex >= 0) {
      attrs[existingIndex] = next;
    } else {
      attrs.push(next);
    }
    rs.resource.attributes = attrs;
  }
}
