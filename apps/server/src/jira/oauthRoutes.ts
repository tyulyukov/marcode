import * as crypto from "node:crypto";
import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Effect } from "effect";
import type { ServerConfigShape } from "../config";
import type { JiraTokenServiceShape, JiraTokenSet } from "./Services/JiraTokenService";
import { JiraOAuthError, JiraTokenError } from "./Errors";

const ATLASSIAN_AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const OAUTH_SCOPES = "read:jira-work read:jira-user offline_access read:me";
const STATE_TTL_MS = 5 * 60 * 1000;
const OAUTH_CALLBACK_PORT = 19571;
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

interface PkceState {
  readonly codeVerifier: string;
  readonly createdAt: number;
}

const pendingStates = new Map<string, PkceState>();
let callbackServer: http.Server | null = null;
let callbackServerTimeout: ReturnType<typeof setTimeout> | null = null;

function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [key, value] of pendingStates) {
    if (now - value.createdAt > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function getRedirectUri(config: ServerConfigShape): string {
  if (config.jiraRedirectUri) {
    return config.jiraRedirectUri;
  }
  return `http://localhost:${OAUTH_CALLBACK_PORT}/api/jira/callback`;
}

function shutdownCallbackServer(): void {
  if (callbackServerTimeout) {
    clearTimeout(callbackServerTimeout);
    callbackServerTimeout = null;
  }
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
  }
}

function startCallbackServer(config: ServerConfigShape): Promise<void> {
  shutdownCallbackServer();

  const mainServerHost = config.host ?? "127.0.0.1";

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://localhost:${OAUTH_CALLBACK_PORT}`);
      if (reqUrl.pathname !== "/api/jira/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const mainCallbackUrl = `http://${mainServerHost}:${config.port}/api/jira/callback${reqUrl.search}`;
      res.writeHead(302, { Location: mainCallbackUrl });
      res.end();
      shutdownCallbackServer();
    });

    server.once("error", (err: NodeJS.ErrnoException) => {
      callbackServer = null;
      if (err.code === "EADDRINUSE") {
        reject(new Error(`OAuth callback port ${OAUTH_CALLBACK_PORT} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(OAUTH_CALLBACK_PORT, "localhost", () => {
      callbackServer = server;
      callbackServerTimeout = setTimeout(() => {
        shutdownCallbackServer();
      }, OAUTH_CALLBACK_TIMEOUT_MS);
      resolve();
    });
  });
}

export function tryHandleJiraAuthRequest(
  url: URL,
  _req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfigShape,
): boolean {
  if (url.pathname !== "/api/jira/auth") return false;

  if (!config.jiraClientId) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("MARCODE_JIRA_CLIENT_ID is not configured");
    return true;
  }

  cleanExpiredStates();

  const state = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePkce();

  pendingStates.set(state, { codeVerifier, createdAt: Date.now() });

  const redirectUri = getRedirectUri(config);

  const doAuth = async () => {
    try {
      await startCallbackServer(config);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(
        err instanceof Error
          ? err.message
          : `Failed to start OAuth callback server on port ${OAUTH_CALLBACK_PORT}`,
      );
      return;
    }

    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: config.jiraClientId!,
      scope: OAUTH_SCOPES,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    res.writeHead(302, { Location: `${ATLASSIAN_AUTHORIZE_URL}?${params.toString()}` });
    res.end();
  };

  void doAuth();
  return true;
}

export function tryHandleJiraCallbackRequest(
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfigShape,
  tokenService: {
    saveTokens: JiraTokenServiceShape["saveTokens"];
  },
): Effect.Effect<boolean, JiraOAuthError | JiraTokenError> {
  if (url.pathname !== "/api/jira/callback") return Effect.succeed(false);
  return handleJiraCallback(url, req, res, config, tokenService);
}

const RESULT_PAGE_STYLE =
  "body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}.card{text-align:center;padding:3rem;border-radius:1rem;border:1px solid #262626;background:#111;max-width:480px}.icon{font-size:3rem;margin-bottom:1rem}h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:0;color:#a1a1aa;font-size:.875rem}.detail{margin-top:1rem;padding:.75rem;border-radius:.5rem;background:#1a1a1a;color:#a1a1aa;font-size:.75rem;text-align:left;word-break:break-all;max-height:120px;overflow:auto}";

function sendResultPage(
  res: ServerResponse,
  icon: string,
  title: string,
  subtitle: string,
  detail?: string,
): void {
  const detailHtml = detail
    ? `<div class="detail">${detail.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
    : "";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!DOCTYPE html><html><head><title>${title}</title><style>${RESULT_PAGE_STYLE}</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${subtitle}</p>${detailHtml}</div></body></html>`,
  );
}

function handleJiraCallback(
  url: URL,
  _req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfigShape,
  tokenService: { saveTokens: JiraTokenServiceShape["saveTokens"] },
): Effect.Effect<boolean, JiraOAuthError | JiraTokenError> {
  return Effect.gen(function* () {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const description = url.searchParams.get("error_description") ?? error;
      sendResultPage(
        res,
        "\u274C",
        "Jira connection failed",
        "Atlassian returned an error.",
        description,
      );
      return true;
    }

    if (!code || !state) {
      sendResultPage(
        res,
        "\u274C",
        "Jira connection failed",
        "Missing code or state parameter in callback.",
      );
      return true;
    }

    const pkceState = pendingStates.get(state);
    pendingStates.delete(state);

    if (!pkceState || Date.now() - pkceState.createdAt > STATE_TTL_MS) {
      sendResultPage(
        res,
        "\u274C",
        "Jira connection failed",
        "Session expired. Please try connecting again from MarCode.",
      );
      return true;
    }

    if (!config.jiraClientId) {
      sendResultPage(
        res,
        "\u274C",
        "Jira connection failed",
        "MARCODE_JIRA_CLIENT_ID is not configured.",
      );
      return true;
    }

    const tokenResponse = yield* Effect.tryPromise({
      try: () =>
        fetch(ATLASSIAN_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: config.jiraClientId,
            ...(config.jiraClientSecret ? { client_secret: config.jiraClientSecret } : {}),
            code,
            redirect_uri: getRedirectUri(config),
            code_verifier: pkceState.codeVerifier,
          }),
        }),
      catch: (cause) =>
        new JiraOAuthError({
          operation: "exchangeCode",
          detail: "Failed to exchange authorization code",
          cause,
        }),
    });

    if (!tokenResponse.ok) {
      const body = yield* Effect.tryPromise({
        try: () => tokenResponse.text(),
        catch: () =>
          new JiraOAuthError({
            operation: "exchangeCode",
            detail: `Token exchange failed with status ${tokenResponse.status}`,
          }),
      });
      sendResultPage(
        res,
        "\u274C",
        "Jira connection failed",
        "Token exchange failed.",
        body.slice(0, 500),
      );
      return true;
    }

    const json = yield* Effect.tryPromise({
      try: () =>
        tokenResponse.json() as Promise<{
          access_token: string;
          refresh_token: string;
          expires_in: number;
          scope: string;
        }>,
      catch: (cause) =>
        new JiraOAuthError({
          operation: "exchangeCode",
          detail: "Failed to parse token exchange response",
          cause,
        }),
    });

    const tokens: JiraTokenSet = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
      scope: json.scope,
    };

    yield* tokenService.saveTokens(tokens);

    sendResultPage(
      res,
      "\u2705",
      "Jira connected successfully",
      "You can close this tab and return to MarCode.",
    );
    return true;
  });
}
