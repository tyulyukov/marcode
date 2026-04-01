export async function GET(): Promise<Response> {
  const clientId = process.env.JIRA_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Jira integration not configured" }, { status: 503 });
  }

  return Response.json({ clientId });
}
