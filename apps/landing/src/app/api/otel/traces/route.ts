import { ingestOtelTraces } from "~/lib/otelIngest";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-marcode-jira-access-token",
  "Access-Control-Max-Age": "600",
} as const;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: Request): Promise<Response> {
  const result = await ingestOtelTraces(request);
  if (result.status === 204) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return Response.json(result.body ?? { error: "OTEL ingest failed" }, {
    status: result.status,
    headers: CORS_HEADERS,
  });
}
