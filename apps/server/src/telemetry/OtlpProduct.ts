import packageJson from "../../package.json" with { type: "json" };

export const JIRA_ACCESS_TOKEN_HEADER = "x-marcode-jira-access-token";

export type ProductAnalyticsAttributes = Readonly<Record<string, unknown>>;

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

export function makeProductSpanPayload(input: {
  readonly event: string;
  readonly attributes: ProductAnalyticsAttributes;
  readonly capturedAt: string;
}) {
  const now = BigInt(new Date(input.capturedAt).getTime()) * 1_000_000n;
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
                startTimeUnixNano: String(now),
                endTimeUnixNano: String(now + 1_000_000n),
                attributes: productAttributesToOtlp(input.attributes),
                events: [],
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
