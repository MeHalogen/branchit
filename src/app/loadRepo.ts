/**
 * Loads a complete, typed repository snapshot for the UI in one place.
 *
 * The dashboard renders immediately from local state; nothing here touches the
 * network (fetch is an explicit user action). Branch metadata, status, and
 * recency all come from batched local git calls.
 */

import type { Branch, RepositoryState } from "../git/models.js";
import type { ParsedStatus } from "../git/parsers.js";
import { recentBranchRanks } from "../git/recent.js";
import type { GitRepository } from "../git/repository.js";

export interface RepoData {
  state: RepositoryState;
  status: ParsedStatus;
  branches: Branch[];
  /** Branch short name -> recency rank (0 = most recent). */
  recentRanks: Map<string, number>;
}

export async function loadRepoData(git: GitRepository): Promise<RepoData> {
  const [state, status, branches, recentRanks] = await Promise.all([
    git.getState(),
    git.getStatus(),
    git.listBranches(),
    recentBranchRanks(git.client),
  ]);
  return { state, status, branches, recentRanks };
}

/** Local branches, current first, then by recency, then name. */
export function orderedLocalBranches(data: RepoData): Branch[] {
  const locals = data.branches.filter((b) => b.kind === "local");
  return [...locals].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const ra = data.recentRanks.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const rb = data.recentRanks.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}
