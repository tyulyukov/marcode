import { createHash } from "node:crypto";

import { redactOtlpBody, upsertResourceAttribute, type OtlpTraceBody } from "~/lib/otelRedact";
import { allow, type RateLimitTier } from "~/lib/otelRateLimit";
import { tokenHash, verifyJiraToken } from "~/lib/otelVerifier";

export const runtime = "nodejs";

const SERVICE_NAME = "marcode";

function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function readClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function parseExtraHeaders(input: string | undefined): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  for (const part of input.split(",")) {
    const [name, ...rest] = part.split("=");
    if (!name) continue;
    const value = rest.join("=").trim();
    if (!value) continue;
    out[name.trim()] = value;
  }
  return out;
}

function isOtlpTraceBody(value: unknown): value is OtlpTraceBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "resourceSpans" in value &&
    Array.isArray((value as { resourceSpans: unknown }).resourceSpans)
  );
}

export async function POST(request: Request): Promise<Response> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!endpoint) {
    return Response.json({ error: "OTEL ingest not configured" }, { status: 503 });
  }

  const ip = readClientIp(request);
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  const token = readBearerToken(request);
  const limitKey = `${ip}:${token ? tokenHash(token) : "anon"}`;

  const verification = token ? await verifyJiraToken(token) : { valid: false, isGenesis: false };
  const isGenesis = verification.isGenesis;
  const tier: RateLimitTier = verification.valid ? "authed" : "anonymous";

  if (!isGenesis) {
    const result = allow(limitKey, tier);
    if (!result.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)).toString(),
        },
      });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isOtlpTraceBody(body)) {
    return Response.json({ error: "Body must be OTLP/JSON with resourceSpans" }, { status: 400 });
  }

  upsertResourceAttribute(body, "service.name", { stringValue: SERVICE_NAME });
  upsertResourceAttribute(body, "user.is_genesis", { boolValue: isGenesis });
  upsertResourceAttribute(body, "ingest.client_ip_hash", { stringValue: ipHash });
  redactOtlpBody(body);

  const extraHeaders = parseExtraHeaders(process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS);
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return Response.json({ error: "Trace export failed", detail: String(cause) }, { status: 502 });
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(JSON.stringify({ error: "Tempo rejected the trace", detail: text }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(null, { status: 204 });
}
