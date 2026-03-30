import { Effect, Layer, Option } from "effect";
import type {
  JiraConnectionStatus,
  JiraGetAttachmentInput,
  JiraGetAttachmentResult,
  JiraGetIssueInput,
  JiraIssue,
  JiraListBoardsInput,
  JiraListBoardsResult,
  JiraListIssuesInput,
  JiraListIssuesResult,
  JiraListSprintsInput,
  JiraListSprintsResult,
  JiraSite,
  JiraUser,
} from "@marcode/contracts";
import { JiraApiClient, type JiraApiClientShape } from "../Services/JiraApiClient";
import { JiraTokenService } from "../Services/JiraTokenService";
import { JiraApiError } from "../Errors";

const ATLASSIAN_API_BASE = "https://api.atlassian.com";

const jiraApiFetch = (
  accessToken: string,
  path: string,
  init?: RequestInit,
): Effect.Effect<Response, JiraApiError> =>
  Effect.tryPromise({
    try: () =>
      fetch(`${ATLASSIAN_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...init?.headers,
        },
      }),
    catch: (cause) =>
      new JiraApiError({ operation: "fetch", detail: `Failed to fetch ${path}`, cause }),
  });

const assertOk = (response: Response, operation: string): Effect.Effect<void, JiraApiError> =>
  response.ok
    ? Effect.void
    : Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new JiraApiError({
            operation,
            detail: `HTTP ${response.status}`,
            statusCode: response.status,
          }),
      }).pipe(
        Effect.flatMap((body) =>
          Effect.fail(
            new JiraApiError({
              operation,
              detail: `HTTP ${response.status}: ${body.slice(0, 500)}`,
              statusCode: response.status,
            }),
          ),
        ),
      );

const parseJsonResponse = <T>(
  response: Response,
  operation: string,
): Effect.Effect<T, JiraApiError> =>
  Effect.tryPromise({
    try: () => response.json() as Promise<T>,
    catch: (cause) =>
      new JiraApiError({ operation, detail: "Failed to parse JSON response", cause }),
  });

export const JiraApiClientLive = Layer.effect(
  JiraApiClient,
  Effect.gen(function* () {
    const tokenService = yield* JiraTokenService;

    const siteUrlByCloudId = new Map<string, string>();

    const authedFetch = (path: string, operation: string, init?: RequestInit) =>
      Effect.gen(function* () {
        const accessToken = yield* tokenService.getValidAccessToken;
        const response = yield* jiraApiFetch(accessToken, path, init);
        if (!response.ok) {
          const tokensOpt = yield* tokenService.getTokens;
          const tokenScope = Option.isSome(tokensOpt) ? tokensOpt.value.scope : "unknown";
          const body = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: (cause) =>
              new JiraApiError({
                operation,
                detail: `HTTP ${response.status} (failed to read body)`,
                statusCode: response.status,
                cause,
              }),
          });
          return yield* Effect.fail(
            new JiraApiError({
              operation,
              detail: `HTTP ${response.status}: ${body.slice(0, 300)} [token scopes: ${tokenScope}]`,
              statusCode: response.status,
            }),
          );
        }
        return response;
      });

    const getAccessibleResources: JiraApiClientShape["getAccessibleResources"] = Effect.gen(
      function* () {
        const response = yield* authedFetch(
          "/oauth/token/accessible-resources",
          "getAccessibleResources",
        );
        const data = yield* parseJsonResponse<
          ReadonlyArray<{
            id: string;
            name: string;
            url: string;
            avatarUrl?: string;
          }>
        >(response, "getAccessibleResources");
        return data.map((site) => {
          siteUrlByCloudId.set(site.id, site.url);
          return {
            cloudId: site.id,
            name: site.name,
            url: site.url,
            ...(site.avatarUrl ? { avatarUrl: site.avatarUrl } : {}),
          } as unknown as JiraSite;
        });
      },
    );

    const getCurrentUser = Effect.gen(function* () {
      const response = yield* authedFetch("/me", "getCurrentUser");
      const data = yield* parseJsonResponse<{
        account_id: string;
        name: string;
        picture?: string;
      }>(response, "getCurrentUser");
      return {
        accountId: data.account_id,
        displayName: data.name,
        ...(data.picture ? { avatarUrl: data.picture } : {}),
      } as unknown as JiraUser;
    });

    const getConnectionStatus: JiraApiClientShape["getConnectionStatus"] = Effect.gen(function* () {
      const tokensOpt = yield* tokenService.getTokens;
      if (Option.isNone(tokensOpt)) {
        return {
          connected: false,
          sites: [],
        } as unknown as JiraConnectionStatus;
      }

      const sites = yield* getAccessibleResources;
      const user = yield* getCurrentUser;
      return {
        connected: true,
        sites,
        user,
      } as unknown as JiraConnectionStatus;
    });

    const listBoards: JiraApiClientShape["listBoards"] = (input) =>
      Effect.gen(function* () {
        const response = yield* authedFetch(
          `/ex/jira/${input.cloudId}/rest/api/3/project/search?maxResults=100&orderBy=name&status=live`,
          "listBoards",
        );
        const data = yield* parseJsonResponse<{
          values: ReadonlyArray<{ id: string; key: string; name: string; projectTypeKey: string }>;
        }>(response, "listBoards");
        return {
          boards: data.values.map(
            (project) =>
              ({
                id: Number(project.id),
                name: `${project.key} — ${project.name}`,
                type: project.projectTypeKey === "software" ? "scrum" : "kanban",
              }) as unknown as JiraListBoardsResult["boards"][number],
          ),
        } as JiraListBoardsResult;
      });

    const listSprints: JiraApiClientShape["listSprints"] = (_input) =>
      Effect.succeed({ sprints: [] } as unknown as JiraListSprintsResult);

    const listIssues: JiraApiClientShape["listIssues"] = (input) =>
      Effect.gen(function* () {
        const startAt = input.startAt ?? 0;
        const maxResults = input.maxResults ?? 50;

        let path: string;
        const fields =
          "summary,status,issuetype,priority,assignee,description,labels,attachment,created,updated";
        const projectClause =
          input.boardId !== undefined ? `project = ${input.boardId}` : undefined;
        if (input.sprintId !== undefined) {
          const parts = [projectClause, `sprint = ${input.sprintId}`].filter(Boolean);
          const jql = encodeURIComponent(`${parts.join(" AND ")} ORDER BY updated DESC`);
          path = `/ex/jira/${input.cloudId}/rest/api/3/search/jql?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`;
        } else if (input.query !== undefined && input.query.length > 0) {
          const keyPatternMatch = input.query.match(/^([A-Z][A-Z0-9]+)-?(\d*)$/i);
          let queryClause: string;
          if (keyPatternMatch && keyPatternMatch[1]) {
            const projectKey = keyPatternMatch[1].toUpperCase();
            const digits = keyPatternMatch[2] ?? "";
            if (digits.length > 0) {
              const n = Number(digits);
              const ranges = [
                `key = "${projectKey}-${n}"`,
                `(key >= "${projectKey}-${n * 10}" AND key <= "${projectKey}-${(n + 1) * 10 - 1}")`,
                `(key >= "${projectKey}-${n * 100}" AND key <= "${projectKey}-${(n + 1) * 100 - 1}")`,
                `(key >= "${projectKey}-${n * 1000}" AND key <= "${projectKey}-${(n + 1) * 1000 - 1}")`,
              ];
              queryClause = `project = "${projectKey}" AND (${ranges.join(" OR ")})`;
            } else {
              queryClause = `project = "${projectKey}" AND sprint in openSprints() AND assignee = currentUser()`;
            }
          } else {
            queryClause = `text ~ "${input.query}"`;
          }
          const isKeySearch = !!keyPatternMatch;
          const parts = [projectClause, queryClause].filter(Boolean);
          const orderBy = isKeySearch ? "ORDER BY key ASC" : "ORDER BY updated DESC";
          const jql = encodeURIComponent(`${parts.join(" AND ")} ${orderBy}`);
          path = `/ex/jira/${input.cloudId}/rest/api/3/search/jql?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`;

          const response = yield* authedFetch(path, "listIssues");
          const data = yield* parseJsonResponse<{
            issues: ReadonlyArray<JiraApiIssueRaw>;
            total: number;
          }>(response, "listIssues");

          if (data.issues.length === 0 && keyPatternMatch && !(keyPatternMatch[2] ?? "")) {
            const fallbackJql = encodeURIComponent(
              `${[projectClause, `project = "${keyPatternMatch[1]!.toUpperCase()}"`].filter(Boolean).join(" AND ")} ORDER BY updated DESC`,
            );
            const fallbackPath = `/ex/jira/${input.cloudId}/rest/api/3/search/jql?jql=${fallbackJql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`;
            const fallbackResponse = yield* authedFetch(fallbackPath, "listIssues");
            const fallbackData = yield* parseJsonResponse<{
              issues: ReadonlyArray<JiraApiIssueRaw>;
              total: number;
            }>(fallbackResponse, "listIssues");
            return {
              issues: fallbackData.issues.map(
                mapRawIssue(input.cloudId as string, siteUrlByCloudId),
              ),
              total: fallbackData.total,
            } as unknown as JiraListIssuesResult;
          }

          return {
            issues: data.issues.map(mapRawIssue(input.cloudId as string, siteUrlByCloudId)),
            total: data.total,
          } as unknown as JiraListIssuesResult;
        } else {
          const jql = encodeURIComponent(
            projectClause ? `${projectClause} ORDER BY updated DESC` : `ORDER BY updated DESC`,
          );
          path = `/ex/jira/${input.cloudId}/rest/api/3/search/jql?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`;
        }

        const response = yield* authedFetch(path, "listIssues");
        const data = yield* parseJsonResponse<{
          issues: ReadonlyArray<JiraApiIssueRaw>;
          total: number;
        }>(response, "listIssues");

        return {
          issues: data.issues.map(mapRawIssue(input.cloudId as string, siteUrlByCloudId)),
          total: data.total,
        } as unknown as JiraListIssuesResult;
      });

    const getIssue: JiraApiClientShape["getIssue"] = (input) =>
      Effect.gen(function* () {
        const response = yield* authedFetch(
          `/ex/jira/${input.cloudId}/rest/api/3/issue/${input.issueKey}?fields=summary,status,issuetype,priority,assignee,description,labels,attachment,created,updated`,
          "getIssue",
        );
        const data = yield* parseJsonResponse<JiraApiIssueRaw>(response, "getIssue");
        return mapRawIssue(input.cloudId as string, siteUrlByCloudId)(data) as unknown as JiraIssue;
      });

    const getAttachment: JiraApiClientShape["getAttachment"] = (input) =>
      Effect.gen(function* () {
        const metaResponse = yield* authedFetch(
          `/ex/jira/${input.cloudId}/rest/api/3/attachment/${input.attachmentId}`,
          "getAttachment.meta",
        );
        const meta = yield* parseJsonResponse<{
          content: string;
          filename: string;
          mimeType: string;
        }>(metaResponse, "getAttachment.meta");

        const accessToken = yield* tokenService.getValidAccessToken;
        const contentResponse = yield* Effect.tryPromise({
          try: () =>
            fetch(meta.content, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          catch: (cause) =>
            new JiraApiError({
              operation: "getAttachment.download",
              detail: "Failed to download attachment",
              cause,
            }),
        });
        yield* assertOk(contentResponse, "getAttachment.download");

        const isTextMime =
          meta.mimeType.startsWith("text/") || meta.mimeType === "application/json";
        const isImageMime = meta.mimeType.startsWith("image/");

        let content: string;
        if (isTextMime) {
          content = yield* Effect.tryPromise({
            try: () => contentResponse.text(),
            catch: (cause) =>
              new JiraApiError({
                operation: "getAttachment.readText",
                detail: "Failed to read text attachment",
                cause,
              }),
          });
        } else if (isImageMime) {
          const buffer = yield* Effect.tryPromise({
            try: () => contentResponse.arrayBuffer(),
            catch: (cause) =>
              new JiraApiError({
                operation: "getAttachment.readImage",
                detail: "Failed to read image attachment",
                cause,
              }),
          });
          content = `data:${meta.mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
        } else {
          content = `[Binary file: ${meta.filename} (${meta.mimeType})]`;
        }

        return {
          content,
          mimeType: meta.mimeType,
          filename: meta.filename,
        } as unknown as JiraGetAttachmentResult;
      });

    const disconnect: JiraApiClientShape["disconnect"] = tokenService.clearTokens;

    return {
      getConnectionStatus,
      getAccessibleResources,
      listBoards,
      listSprints,
      listIssues,
      getIssue,
      getAttachment,
      disconnect,
    };
  }),
);

interface JiraApiIssueRaw {
  readonly key: string;
  readonly self: string;
  readonly fields: {
    readonly summary: string;
    readonly status: { readonly name: string };
    readonly issuetype: { readonly name: string };
    readonly priority?: { readonly name: string } | null;
    readonly assignee?: {
      readonly accountId: string;
      readonly displayName: string;
      readonly avatarUrls?: { readonly "48x48"?: string };
    } | null;
    readonly description?: unknown;
    readonly labels?: ReadonlyArray<string>;
    readonly attachment?: ReadonlyArray<{
      readonly id: string;
      readonly filename: string;
      readonly mimeType: string;
      readonly size: number;
    }>;
    readonly created: string;
    readonly updated: string;
  };
}

function renderAdfToPlainText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return String(node);

  const obj = node as Record<string, unknown>;
  if (obj.type === "text" && typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.content)) {
    return (obj.content as unknown[])
      .map(renderAdfToPlainText)
      .join(obj.type === "paragraph" ? "\n" : "");
  }
  return "";
}

const mapRawIssue =
  (cloudId: string, siteUrlByCloudId: Map<string, string>) => (raw: JiraApiIssueRaw) => ({
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status.name,
    issueType: raw.fields.issuetype.name,
    ...(raw.fields.priority ? { priority: raw.fields.priority.name } : {}),
    ...(raw.fields.assignee
      ? {
          assignee: {
            accountId: raw.fields.assignee.accountId,
            displayName: raw.fields.assignee.displayName,
            ...(raw.fields.assignee.avatarUrls?.["48x48"]
              ? { avatarUrl: raw.fields.assignee.avatarUrls["48x48"] }
              : {}),
          },
        }
      : {}),
    description: renderAdfToPlainText(raw.fields.description),
    labels: raw.fields.labels ?? [],
    attachments: (raw.fields.attachment ?? []).map((att) => ({
      id: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
    })),
    url: siteUrlByCloudId.has(cloudId)
      ? `${siteUrlByCloudId.get(cloudId)}/browse/${raw.key}`
      : `https://api.atlassian.com/ex/jira/${cloudId}/browse/${raw.key}`,
    createdAt: raw.fields.created,
    updatedAt: raw.fields.updated,
  });
