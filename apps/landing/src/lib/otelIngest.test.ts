import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetOtelIngestForTests, ingestOtelTraces } from "./otelIngest";

const makePayload = () => ({
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "marcode-web" } },
          { key: "project.name", value: { stringValue: "MarCode" } },
          { key: "auth.token", value: { stringValue: "secret" } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: "test", attributes: [] },
          spans: [
            {
              traceId: "1".repeat(32),
              spanId: "2".repeat(16),
              name: "marcode.ui.composer.submit",
              kind: 1,
              startTimeUnixNano: "1",
              endTimeUnixNano: "2",
              attributes: [
                { key: "provider", value: { stringValue: "codex" } },
                { key: "prompt.text", value: { stringValue: "do not forward" } },
              ],
              events: [
                {
                  name: "event",
                  timeUnixNano: "1",
                  attributes: [{ key: "stdout", value: { stringValue: "nope" } }],
                },
              ],
              links: [],
              status: { code: "STATUS_CODE_OK" },
            },
          ],
        },
      ],
    },
  ],
});

function request(body: unknown, headers?: Record<string, string>) {
  return new Request("https://marcode.dev/api/otel/traces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  __resetOtelIngestForTests();
  vi.restoreAllMocks();
});

describe("otel ingest", () => {
  it("sanitizes and forwards valid OTLP payloads", async () => {
    const forwarded: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      forwarded.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const result = await ingestOtelTraces(request(makePayload()), {
      collectorUrl: "https://collector.example/v1/traces",
      fetch: fetchMock,
    });

    expect(result.status).toBe(204);
    expect(forwarded).toHaveLength(1);
    const payload = forwarded[0] as ReturnType<typeof makePayload>;
    const attrs = payload.resourceSpans[0]!.resource.attributes;
    expect(attrs).toContainEqual({ key: "service.name", value: { stringValue: "marcode" } });
    expect(attrs).toContainEqual({
      key: "marcode.original_service_name",
      value: { stringValue: "marcode-web" },
    });
    expect(attrs.some((attr) => attr.key === "auth.token")).toBe(false);
    const spanAttrs = payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.attributes;
    expect(spanAttrs).toEqual([{ key: "provider", value: { stringValue: "codex" } }]);
    expect(payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.events![0]!.attributes).toEqual([]);
  });

  it("marks Genesis users from verified Jira email and bypasses rate limits", async () => {
    const forwarded: unknown[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.atlassian.com/me") {
        return Response.json({ email: "dev@gen.tech", account_id: "jira-account" });
      }
      forwarded.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    for (let index = 0; index < 3; index++) {
      const result = await ingestOtelTraces(
        request(makePayload(), { "x-marcode-jira-access-token": "jira-token" }),
        {
          collectorUrl: "https://collector.example/v1/traces",
          fetch: fetchMock,
          rateLimitPerMinute: 1,
          clientKey: "same-client",
        },
      );
      expect(result.status).toBe(204);
    }

    const payload = forwarded[0] as ReturnType<typeof makePayload>;
    expect(payload.resourceSpans[0]!.resource.attributes).toContainEqual({
      key: "analytics.user.is_genesis",
      value: { boolValue: true },
    });
  });

  it("rate limits non-Genesis users", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;

    const first = await ingestOtelTraces(request(makePayload()), {
      collectorUrl: "https://collector.example/v1/traces",
      fetch: fetchMock,
      rateLimitPerMinute: 1,
      clientKey: "same-client",
    });
    const second = await ingestOtelTraces(request(makePayload()), {
      collectorUrl: "https://collector.example/v1/traces",
      fetch: fetchMock,
      rateLimitPerMinute: 1,
      clientKey: "same-client",
    });

    expect(first.status).toBe(204);
    expect(second.status).toBe(429);
  });

  it("rejects invalid and oversized payloads", async () => {
    const invalid = await ingestOtelTraces(request({ nope: true }), {
      collectorUrl: "https://collector.example/v1/traces",
    });
    const oversized = await ingestOtelTraces(request(makePayload()), {
      collectorUrl: "https://collector.example/v1/traces",
      maxBodyBytes: 10,
    });

    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it("returns 502 when collector forwarding fails", async () => {
    const fetchMock = vi.fn(
      async () => new Response("bad", { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await ingestOtelTraces(request(makePayload()), {
      collectorUrl: "https://collector.example/v1/traces",
      fetch: fetchMock,
    });

    expect(result.status).toBe(502);
  });
});
