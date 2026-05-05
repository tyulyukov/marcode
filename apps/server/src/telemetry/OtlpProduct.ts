import packageJson from "../../package.json" with { type: "json" };

export const JIRA_ACCESS_TOKEN_HEADER = "x-marcode-jira-access-token";

export type ProductAnalyticsAttributes = Readonly<Record<string, unknown>>;
export type ProductAnalyticsSpanEvent = Readonly<{
  name: string;
  attributes?: ProductAnalyticsAttributes;
  at?: string | number | Date;
}>;

function valueToOtlp(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "bigint") return { intValue: value.toString() };
  return { stringValue: String(value) };
}

export function productAttributesToOtlp(attributes: ProductAnalyticsAttributes) {
  return Object.entries(attributes).flatMap(([key, value]) => {
    const otlpValue = valueToOtlp(value);
    return otlpValue ? [{ key, value: otlpValue }] : [];
  });
}

function timeToUnixNano(value: string | number | Date): bigint {
  const ms =
    value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return BigInt(Number.isFinite(ms) ? ms : Date.now()) * 1_000_000n;
}

export function makeProductSpanPayload(input: {
  readonly event: string;
  readonly attributes: ProductAnalyticsAttributes;
  readonly capturedAt: string;
  readonly durationMs?: number;
  readonly startedAt?: string | number | Date;
  readonly spanEvents?: ReadonlyArray<ProductAnalyticsSpanEvent>;
}) {
  const start = input.startedAt
    ? timeToUnixNano(input.startedAt)
    : timeToUnixNano(input.capturedAt);
  const durationNano = BigInt(Math.max(1, input.durationMs ?? 1)) * 1_000_000n;
  const end = start + durationNano;
  return {
    resourceSpans: [
      {
        resource: {
          attributes: productAttributesToOtlp({
            "service.name": "marcode",
            "service.runtime": "marcode-server",
            "service.version": packageJson.version,
          }),
        },
        scopeSpans: [
          {
            scope: {
              name: "marcode.product-analytics",
              version: packageJson.version,
              attributes: [],
            },
            spans: [
              {
                traceId: crypto.randomUUID().replaceAll("-", ""),
                spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
                name: input.event,
                kind: 1,
                startTimeUnixNano: String(start),
                endTimeUnixNano: String(end),
                attributes: productAttributesToOtlp(input.attributes),
                events: (input.spanEvents ?? []).map((event) => ({
                  timeUnixNano: String(event.at ? timeToUnixNano(event.at) : end),
                  name: event.name,
                  attributes: productAttributesToOtlp(event.attributes ?? {}),
                  droppedAttributesCount: 0,
                })),
                links: [],
                status: { code: "STATUS_CODE_OK" },
                flags: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function makeProductSpanBatchPayload(
  events: ReadonlyArray<{
    readonly event: string;
    readonly attributes: ProductAnalyticsAttributes;
    readonly capturedAt: string;
    readonly durationMs?: number;
    readonly startedAt?: string | number | Date;
    readonly spanEvents?: ReadonlyArray<ProductAnalyticsSpanEvent>;
  }>,
) {
  return {
    resourceSpans: events.flatMap((event) => makeProductSpanPayload(event).resourceSpans),
  };
}

export function productAnalyticsUrlFromConfig(input: {
  readonly productAnalyticsTracesUrl: string | undefined;
  readonly jiraTokenProxyUrl: string | undefined;
}): string | undefined {
  return (
    input.productAnalyticsTracesUrl ??
    (input.jiraTokenProxyUrl
      ? `${input.jiraTokenProxyUrl.replace(/\/+$/, "")}/api/otel/traces`
      : undefined)
  );
}

export function shouldAttachJiraProof(input: {
  readonly targetUrl: string;
  readonly jiraTokenProxyUrl: string | undefined;
}): boolean {
  if (!input.jiraTokenProxyUrl) return false;
  try {
    return new URL(input.targetUrl).origin === new URL(input.jiraTokenProxyUrl).origin;
  } catch {
    return false;
  }
}
