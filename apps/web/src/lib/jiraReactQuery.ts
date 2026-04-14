import { queryOptions } from "@tanstack/react-query";
import type { JiraCloudId, JiraBoardId, JiraSprintId, JiraIssueKey } from "@marcode/contracts";
import { ensureNativeApi } from "../nativeApi";

export const jiraQueryKeys = {
  all: ["jira"] as const,
  connectionStatus: () => [...jiraQueryKeys.all, "connectionStatus"] as const,
  sites: () => [...jiraQueryKeys.all, "sites"] as const,
  boards: (cloudId: JiraCloudId) => [...jiraQueryKeys.all, "boards", cloudId] as const,
  sprints: (cloudId: JiraCloudId, boardId: JiraBoardId) =>
    [...jiraQueryKeys.all, "sprints", cloudId, boardId] as const,
  issues: (cloudId: JiraCloudId, boardId: JiraBoardId, sprintId?: JiraSprintId) =>
    [...jiraQueryKeys.all, "issues", cloudId, boardId, sprintId] as const,
  issueSearch: (cloudId: JiraCloudId, query: string) =>
    [...jiraQueryKeys.all, "issueSearch", cloudId, query] as const,
  issue: (cloudId: JiraCloudId, issueKey: JiraIssueKey) =>
    [...jiraQueryKeys.all, "issue", cloudId, issueKey] as const,
};

export function jiraConnectionStatusQueryOptions() {
  return queryOptions({
    queryKey: jiraQueryKeys.connectionStatus(),
    queryFn: () => ensureNativeApi().jira.getConnectionStatus(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: "always",
  });
}

export function jiraSitesQueryOptions() {
  return queryOptions({
    queryKey: jiraQueryKeys.sites(),
    queryFn: () => ensureNativeApi().jira.listSites(),
    staleTime: 10 * 60 * 1000,
  });
}

export function jiraBoardsQueryOptions(cloudId: JiraCloudId) {
  return queryOptions({
    queryKey: jiraQueryKeys.boards(cloudId),
    queryFn: () => ensureNativeApi().jira.listBoards({ cloudId }),
    staleTime: 5 * 60 * 1000,
    enabled: cloudId.length > 0,
  });
}

export function jiraSprintsQueryOptions(cloudId: JiraCloudId, boardId: JiraBoardId) {
  return queryOptions({
    queryKey: jiraQueryKeys.sprints(cloudId, boardId),
    queryFn: () => ensureNativeApi().jira.listSprints({ cloudId, boardId }),
    staleTime: 60 * 1000,
    enabled: cloudId.length > 0 && boardId > 0,
  });
}

export function jiraIssuesQueryOptions(
  cloudId: JiraCloudId,
  boardId: JiraBoardId,
  sprintId?: JiraSprintId,
) {
  return queryOptions({
    queryKey: jiraQueryKeys.issues(cloudId, boardId, sprintId),
    queryFn: () =>
      ensureNativeApi().jira.listIssues({
        cloudId,
        boardId,
        ...(sprintId !== undefined ? { sprintId } : {}),
        maxResults: 50 as never,
      }),
    staleTime: 60 * 1000,
    enabled: cloudId.length > 0 && boardId > 0,
  });
}

export function jiraIssueSearchQueryOptions(cloudId: JiraCloudId, query: string) {
  return queryOptions({
    queryKey: jiraQueryKeys.issueSearch(cloudId, query),
    queryFn: async () => {
      const result = await ensureNativeApi().jira.listIssues({ cloudId, query });
      return result;
    },
    staleTime: 30 * 1000,
    retry: 1,
    enabled: cloudId.length > 0 && query.length > 0,
  });
}

export function jiraIssueQueryOptions(cloudId: JiraCloudId, issueKey: JiraIssueKey) {
  return queryOptions({
    queryKey: jiraQueryKeys.issue(cloudId, issueKey),
    queryFn: () => ensureNativeApi().jira.getIssue({ cloudId, issueKey }),
    staleTime: 5 * 60 * 1000,
    enabled: cloudId.length > 0 && issueKey.length > 0,
  });
}
