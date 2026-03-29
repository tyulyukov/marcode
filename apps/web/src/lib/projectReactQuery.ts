import type {
  ProjectBrowseDirectoriesResult,
  ProjectSearchEntriesResult,
} from "@marcode/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
  browseDirectories: (cwd: string | null, pathQuery: string, limit: number) =>
    ["projects", "browse-directories", cwd, pathQuery, limit] as const,
};

const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};

export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

const DEFAULT_BROWSE_DIRECTORIES_LIMIT = 80;
const DEFAULT_BROWSE_DIRECTORIES_STALE_TIME = 5_000;
const EMPTY_BROWSE_DIRECTORIES_RESULT: ProjectBrowseDirectoriesResult = {
  entries: [],
  truncated: false,
};

export function projectBrowseDirectoriesQueryOptions(input: {
  cwd: string | null;
  pathQuery: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_BROWSE_DIRECTORIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.browseDirectories(input.cwd, input.pathQuery, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Directory browsing is unavailable.");
      }
      return api.projects.browseDirectories({
        cwd: input.cwd,
        pathQuery: input.pathQuery,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: input.staleTime ?? DEFAULT_BROWSE_DIRECTORIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_BROWSE_DIRECTORIES_RESULT,
  });
}
