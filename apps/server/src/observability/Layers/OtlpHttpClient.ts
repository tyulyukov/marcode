/**
 * OtlpHttpClient - HttpClient wrapper that attaches a Jira OAuth access token
 * to outbound OTLP exports.
 *
 * The wrapped client is local to the `ObservabilityLive` layer; it does NOT
 * replace the application-wide HttpClient. We read the encrypted tokens file
 * (`<stateDir>/jira-tokens.json`) directly to avoid pulling `JiraTokenService`
 * below `ObservabilityLive` in the layer graph.
 *
 * Stale / missing tokens → request goes out unsigned. The remote ingest then
 * treats the trace as anonymous (stricter rate limit) but still ingests it.
 */
import type { ServerConfigShape } from "../../config.ts";
import { Effect, FileSystem, Option } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { decryptTokens, deriveKey } from "../../jira/crypto.ts";

interface JiraTokenSetOnDisk {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly scope: string;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const readJiraAccessTokenFromDisk = (
  config: ServerConfigShape,
  fs: FileSystem.FileSystem,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const tokensExist = yield* fs.exists(config.jiraTokensPath);
    if (!tokensExist) return Option.none<string>();

    const seedExists = yield* fs.exists(config.anonymousIdPath);
    const seed = seedExists
      ? yield* fs.readFileString(config.anonymousIdPath)
      : "marcode-default-seed";
    const key = deriveKey(seed.trim());

    const raw = yield* fs.readFileString(config.jiraTokensPath);
    const decrypted = decryptTokens(raw.trim(), key);
    const tokens = JSON.parse(decrypted) as JiraTokenSetOnDisk;

    if (
      typeof tokens.accessToken !== "string" ||
      typeof tokens.expiresAt !== "number" ||
      tokens.expiresAt - Date.now() < REFRESH_BUFFER_MS
    ) {
      return Option.none<string>();
    }
    return Option.some(tokens.accessToken);
  }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>())));

const requestTargetsOtlpEndpoint = (
  request: HttpClientRequest.HttpClientRequest,
  otlpTracesUrl: string | undefined,
): boolean => {
  if (!otlpTracesUrl) return false;
  return request.url === otlpTracesUrl || request.url.startsWith(otlpTracesUrl);
};

/**
 * wrapHttpClientWithOtlpAuth - decorates a base HttpClient so OTLP export
 * requests carry an `Authorization: Bearer <jira-access-token>` header.
 *
 * Non-OTLP requests pass through untouched.
 *
 * `fs` is captured at wrap time (rather than yielded from Effect context) so
 * the resulting client preserves `R = never` and can be used as the
 * `HttpClient.HttpClient` service for OTLP exporters.
 */
export const wrapHttpClientWithOtlpAuth = (
  baseClient: HttpClient.HttpClient,
  config: ServerConfigShape,
  fs: FileSystem.FileSystem,
): HttpClient.HttpClient =>
  baseClient.pipe(
    HttpClient.mapRequestEffect((request) =>
      Effect.gen(function* () {
        if (!requestTargetsOtlpEndpoint(request, config.otlpTracesUrl)) {
          return request;
        }
        const tokenOption = yield* readJiraAccessTokenFromDisk(config, fs);
        return Option.match(tokenOption, {
          onNone: () => request,
          onSome: (token) =>
            HttpClientRequest.setHeader(request, "Authorization", `Bearer ${token}`),
        });
      }),
    ),
  );
