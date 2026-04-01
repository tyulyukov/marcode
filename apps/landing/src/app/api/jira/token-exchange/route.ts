const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

const ALLOWED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

const REQUIRED_FIELDS_BY_GRANT: Record<string, ReadonlyArray<string>> = {
  authorization_code: ["client_id", "code", "redirect_uri", "code_verifier"],
  refresh_token: ["client_id", "refresh_token"],
};

export async function POST(request: Request): Promise<Response> {
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  if (!clientSecret) {
    return Response.json({ error: "Token proxy not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const grantType = body.grant_type;
  if (typeof grantType !== "string" || !ALLOWED_GRANT_TYPES.has(grantType)) {
    return Response.json({ error: "Invalid grant_type" }, { status: 400 });
  }

  const requiredFields = REQUIRED_FIELDS_BY_GRANT[grantType];
  if (requiredFields) {
    for (const field of requiredFields) {
      if (!body[field]) {
        return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }
  }

  const { client_secret: _stripped, ...rest } = body;
  const forwardBody = { ...rest, client_secret: clientSecret };

  const atlassianResponse = await fetch(ATLASSIAN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(forwardBody),
  });

  const responseBody = await atlassianResponse.text();
  return new Response(responseBody, {
    status: atlassianResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
