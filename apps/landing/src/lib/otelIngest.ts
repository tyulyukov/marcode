import packageJson from "../../package.json" with { type: "json" };

const ATLASSIAN_ME_URL = "https://api.atlassian.com/me";
const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const DEFAULT_RATE_LIMIT_BYTES_PER_HOUR = 10 * 1024 * 1024;
const DEFAULT_GENESIS_DOMAINS = ["gen.tech", "obrio.co"] as const;
const JIRA_ACCESS_TOKEN_HEADER = "x-marcode-jira-access-token";
const UNSAFE_ATTRIBUTE_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "prompt",
  "content",
  "raw",
  "stdout",
  "stderr",
] as const;

type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string | number }
  | { doubleValue: number }
  | { arrayValue: { values: OtlpAnyValue[] } }
  | { kvlistValue: { values: OtlpKeyValue[] } }
  | { bytesValue: string };

interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

interface OtlpResourceSpan {
  resource?: {
    attributes?: OtlpKeyValue[];
    [key: string]: unknown;
  };
  scopeSpans?: Array<{
    scope?: {
      attributes?: OtlpKeyValue[];
      [key: string]: unknown;
    };
    spans?: Array<{
      attributes?: OtlpKeyValue[];
      events?: Array<{ attributes?: OtlpKeyValue[]; [key: string]: unknown }>;
      links?: Array<{ attributes?: OtlpKeyValue[]; [key: string]: unknown }>;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface OtlpTracePayload {
  resourceSpans: OtlpResourceSpan[];
}

interface RateLimitBucket {
  minuteStartedAt: number;
  minuteCount: number;
  hourStartedAt: number;
  hourBytes: number;
}

interface JiraVerification {
  isGenesis: boolean;
  accountIdHash?: string;
  expiresAt: number;
}

export interface OtelIngestResult {
  status: 204 | 400 | 413 | 429 | 502 | 503;
  body?: Record<string, string>;
  forwardedPayload?: OtlpTracePayload;
}

export interface OTelIngestOptions {
  now?: () => number;
  fetch?: typeof fetch;
  collectorUrl?: string;
  collectorHeaders?: string;
  maxBodyBytes?: number;
  rateLimitPerMinute?: number;
  rateLimitBytesPerHour?: number;
  genesisDomains?: ReadonlyArray<string>;
  clientKey?: string;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const jiraVerificationCache = new Map<string, JiraVerification>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCollectorHeaders(raw: string | undefined): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (!raw) return headers;

  for (const part of raw.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) headers.set(key, value);
  }

  return headers;
}

function parseGenesisDomains(raw: string | undefined): ReadonlyArray<string> {
  const domains = raw
    ?.split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return domains && domains.length > 0 ? domains : DEFAULT_GENESIS_DOMAINS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOtlpTracePayload(value: unknown): value is OtlpTracePayload {
  return (
    isRecord(value) &&
    Array.isArray(value.resourceSpans) &&
    value.resourceSpans.every((resourceSpan) => isRecord(resourceSpan))
  );
}

function shouldDropAttribute(key: string): boolean {
  const normalized = key.toLowerCase();
  return UNSAFE_ATTRIBUTE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeAttributes(attributes: OtlpKeyValue[] | undefined): OtlpKeyValue[] {
  if (!Array.isArray(attributes)) return [];
  return attributes.filter((attribute) => {
    if (!isRecord(attribute) || typeof attribute.key !== "string") return false;
    return !shouldDropAttribute(attribute.key);
  });
}

function stringValue(value: string): OtlpAnyValue {
  return { stringValue: value };
}

function boolValue(value: boolean): OtlpAnyValue {
  return { boolValue: value };
}

function upsertAttribute(attributes: OtlpKeyValue[], key: string, value: OtlpAnyValue): void {
  const existing = attributes.find((attribute) => attribute.key === key);
  if (existing) {
    existing.value = value;
  } else {
    attributes.push({ key, value });
  }
}

function getStringAttribute(attributes: OtlpKeyValue[], key: string): string | undefined {
  const value = attributes.find((attribute) => attribute.key === key)?.value;
  return value && "stringValue" in value ? value.stringValue : undefined;
}

function sanitizePayload(
  payload: OtlpTracePayload,
  identity: { isGenesis: boolean; jiraAccountIdHash?: string },
): OtlpTracePayload {
  return {
    ...payload,
    resourceSpans: payload.resourceSpans.map((resourceSpan) => {
      const resource = isRecord(resourceSpan.resource) ? { ...resourceSpan.resource } : {};
      const resourceAttributes = sanitizeAttributes(resource.attributes);
      const originalServiceName = getStringAttribute(resourceAttributes, "service.name");

      if (originalServiceName && originalServiceName !== "marcode") {
        upsertAttribute(
          resourceAttributes,
          "marcode.original_service_name",
          stringValue(originalServiceName),
        );
      }
      upsertAttribute(resourceAttributes, "service.name", stringValue("marcode"));
      upsertAttribute(resourceAttributes, "marcode.ingest", stringValue("landing"));
      upsertAttribute(
        resourceAttributes,
        "marcode.ingest.version",
        stringValue(packageJson.version),
      );
      upsertAttribute(
        resourceAttributes,
        "analytics.user.is_genesis",
        boolValue(identity.isGenesis),
      );
      if (identity.jiraAccountIdHash) {
        upsertAttribute(
          resourceAttributes,
          "analytics.user.jira.account_id_hash",
          stringValue(identity.jiraAccountIdHash),
        );
      }
      resource.attributes = resourceAttributes;

      const sanitizedResourceSpan: OtlpResourceSpan = {
        ...resourceSpan,
        resource,
      };
      if (Array.isArray(resourceSpan.scopeSpans)) {
        sanitizedResourceSpan.scopeSpans = resourceSpan.scopeSpans.map((scopeSpan) => {
          const sanitizedScopeSpan: NonNullable<OtlpResourceSpan["scopeSpans"]>[number] = {
            ...scopeSpan,
          };
          if (isRecord(scopeSpan.scope)) {
            sanitizedScopeSpan.scope = {
              ...scopeSpan.scope,
              attributes: sanitizeAttributes(scopeSpan.scope.attributes),
            };
          }
          if (Array.isArray(scopeSpan.spans)) {
            sanitizedScopeSpan.spans = scopeSpan.spans.map((span) => {
              const sanitizedSpan: NonNullable<
                NonNullable<OtlpResourceSpan["scopeSpans"]>[number]["spans"]
              >[number] = {
                ...span,
                attributes: sanitizeAttributes(span.attributes),
              };
              if (Array.isArray(span.events)) {
                sanitizedSpan.events = span.events.map((event) => ({
                  ...event,
                  attributes: sanitizeAttributes(event.attributes),
                }));
              }
              if (Array.isArray(span.links)) {
                sanitizedSpan.links = span.links.map((link) => ({
                  ...link,
                  attributes: sanitizeAttributes(link.attributes),
                }));
              }
              return sanitizedSpan;
            });
          }
          return sanitizedScopeSpan;
        });
      }
      return sanitizedResourceSpan;
    }),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emailMatchesGenesisDomain(email: string, domains: ReadonlyArray<string>): boolean {
  const normalized = email.trim().toLowerCase();
  return domains.some((domain) => normalized.endsWith(`@${domain}`));
}

async function verifyJiraToken(input: {
  token: string | null;
  now: number;
  fetchImpl: typeof fetch;
  genesisDomains: ReadonlyArray<string>;
}): Promise<{ isGenesis: boolean; jiraAccountIdHash?: string }> {
  if (!input.token) return { isGenesis: false };

  const tokenHash = await sha256Hex(input.token);
  const cached = jiraVerificationCache.get(tokenHash);
  if (cached && cached.expiresAt > input.now) {
    return {
      isGenesis: cached.isGenesis,
      ...(cached.accountIdHash ? { jiraAccountIdHash: cached.accountIdHash } : {}),
    };
  }

  try {
    const response = await input.fetchImpl(ATLASSIAN_ME_URL, {
      headers: { Authorization: `Bearer ${input.token}`, Accept: "application/json" },
    });
    if (!response.ok) return { isGenesis: false };
    const data = (await response.json()) as {
      email?: string;
      emailAddress?: string;
      account_id?: string;
      accountId?: string;
    };
    const email = data.email ?? data.emailAddress ?? "";
    const accountId = data.account_id ?? data.accountId;
    const accountIdHash = accountId ? await sha256Hex(accountId) : undefined;
    const verification: JiraVerification = {
      isGenesis: emailMatchesGenesisDomain(email, input.genesisDomains),
      ...(accountIdHash ? { accountIdHash } : {}),
      expiresAt: input.now + 15 * 60 * 1000,
    };
    jiraVerificationCache.set(tokenHash, verification);
    return {
      isGenesis: verification.isGenesis,
      ...(verification.accountIdHash ? { jiraAccountIdHash: verification.accountIdHash } : {}),
    };
  } catch {
    return { isGenesis: false };
  }
}

function checkRateLimit(input: {
  key: string;
  bytes: number;
  now: number;
  perMinute: number;
  bytesPerHour: number;
}): boolean {
  const current = rateLimitBuckets.get(input.key);
  const bucket: RateLimitBucket =
    current ??
    ({
      minuteStartedAt: input.now,
      minuteCount: 0,
      hourStartedAt: input.now,
      hourBytes: 0,
    } satisfies RateLimitBucket);

  if (input.now - bucket.minuteStartedAt >= 60_000) {
    bucket.minuteStartedAt = input.now;
    bucket.minuteCount = 0;
  }
  if (input.now - bucket.hourStartedAt >= 60 * 60_000) {
    bucket.hourStartedAt = input.now;
    bucket.hourBytes = 0;
  }

  bucket.minuteCount += 1;
  bucket.hourBytes += input.bytes;
  rateLimitBuckets.set(input.key, bucket);

  return bucket.minuteCount <= input.perMinute && bucket.hourBytes <= input.bytesPerHour;
}

function getClientKey(request: Request, explicit: string | undefined): string {
  if (explicit) return explicit;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function ingestOtelTraces(
  request: Request,
  options: OTelIngestOptions = {},
): Promise<OtelIngestResult> {
  const now = options.now?.() ?? Date.now();
  const fetchImpl = options.fetch ?? fetch;
  const collectorUrl = options.collectorUrl ?? process.env.MARCODE_OTEL_COLLECTOR_TRACES_URL;
  const maxBodyBytes =
    options.maxBodyBytes ??
    parsePositiveInt(process.env.MARCODE_OTEL_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const rateLimitPerMinute =
    options.rateLimitPerMinute ??
    parsePositiveInt(process.env.MARCODE_OTEL_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE);
  const rateLimitBytesPerHour =
    options.rateLimitBytesPerHour ??
    parsePositiveInt(
      process.env.MARCODE_OTEL_RATE_LIMIT_BYTES_PER_HOUR,
      DEFAULT_RATE_LIMIT_BYTES_PER_HOUR,
    );
  const genesisDomains =
    options.genesisDomains ?? parseGenesisDomains(process.env.MARCODE_OTEL_GENESIS_DOMAINS);

  if (!collectorUrl) {
    return { status: 503, body: { error: "OTEL collector is not configured" } };
  }

  const body = await request.text();
  const bodyBytes = new TextEncoder().encode(body).byteLength;
  if (bodyBytes > maxBodyBytes) {
    return { status: 413, body: { error: "OTEL payload is too large" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, body: { error: "Invalid JSON body" } };
  }
  if (!isOtlpTracePayload(parsed)) {
    return { status: 400, body: { error: "Invalid OTLP trace payload" } };
  }

  const jiraToken = request.headers.get(JIRA_ACCESS_TOKEN_HEADER);
  const identity = await verifyJiraToken({
    token: jiraToken,
    now,
    fetchImpl,
    genesisDomains,
  });

  if (!identity.isGenesis) {
    const allowed = checkRateLimit({
      key: getClientKey(request, options.clientKey),
      bytes: bodyBytes,
      now,
      perMinute: rateLimitPerMinute,
      bytesPerHour: rateLimitBytesPerHour,
    });
    if (!allowed) {
      return { status: 429, body: { error: "Rate limit exceeded" } };
    }
  }

  const forwardedPayload = sanitizePayload(parsed, identity);
  const collectorResponse = await fetchImpl(collectorUrl, {
    method: "POST",
    headers: parseCollectorHeaders(
      options.collectorHeaders ?? process.env.MARCODE_OTEL_COLLECTOR_HEADERS,
    ),
    body: JSON.stringify(forwardedPayload),
  });

  if (!collectorResponse.ok) {
    return { status: 502, body: { error: "Failed to forward OTEL payload" }, forwardedPayload };
  }

  return { status: 204, forwardedPayload };
}

export function __resetOtelIngestForTests(): void {
  rateLimitBuckets.clear();
  jiraVerificationCache.clear();
}
