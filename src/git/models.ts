/**
 * Core Git domain types.
 *
 * These describe repository state as Branchit understands it. They deliberately
 * avoid UI-specific fields (selection, focus, etc.) — that state lives in the
 * screen/state layer, not here.
 */

export type BranchKind = "local" | "remote";

export interface CommitRef {
  /** Abbreviated hash (as returned by git). */
  shortSha: string;
  /** Full 40-char hash when available. */
  sha: string;
  subject: string;
  authorName: string;
  /** Committer date as an ISO-8601 string (git %cI). */
  committedAt: string;
}

export interface UpstreamInfo {
  /** e.g. "origin/main". */
  ref: string;
  remoteName: string;
  /** Commits on the local branch not on upstream. */
  ahead: number;
  /** Commits on upstream not on the local branch. */
  behind: number;
  /** True when the configured upstream ref no longer exists on the remote. */
  gone: boolean;
}

export interface Branch {
  /** Stable identity for selection preservation: the full ref name. */
  id: string;
  /** Short display name, e.g. "feat/payments" or "origin/feat/payments". */
  name: string;
  /** Full ref, e.g. "refs/heads/feat/payments". */
  fullRef: string;
  kind: BranchKind;
  isCurrent: boolean;
  upstream: UpstreamInfo | null;
  lastCommit: CommitRef | null;
  /** Absolute path of a linked worktree that has this branch checked out. */
  worktreePath: string | null;
}

export type FileStatusKind =
  | "staged"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface FileChange {
  path: string;
  /** For renames, the original path. */
  origPath?: string;
  kind: FileStatusKind;
  /** Raw two-char XY code from porcelain v2 (e.g. "M.", ".M", "??"). */
  xy: string;
}

export interface WorkingTreeState {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  conflicted: FileChange[];
  get isClean(): boolean;
}

export function makeWorkingTree(
  files: Omit<WorkingTreeState, "isClean">,
): WorkingTreeState {
  return {
    ...files,
    get isClean() {
      return (
        this.staged.length === 0 &&
        this.unstaged.length === 0 &&
        this.untracked.length === 0 &&
        this.conflicted.length === 0
      );
    },
  };
}

export type HostKind = "github" | "gitlab" | "bitbucket" | "unknown";

export interface Remote {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
  hostKind: HostKind;
}

/** In-progress Git operations that must take priority over normal workflows. */
export type OperationState =
  | "none"
  | "merge"
  | "rebase"
  | "cherry_pick"
  | "revert"
  | "bisect";

export interface RepositoryState {
  rootPath: string;
  gitDir: string;
  /** Directory Branchit was launched from (may be a subdirectory of root). */
  cwd: string;
  currentBranch: string | null;
  head: CommitRef | null;
  isDetached: boolean;
  isBare: boolean;
  /** True when HEAD exists but points at no commit yet (fresh repo). */
  isUnborn: boolean;
  operation: OperationState;
  remotes: Remote[];
  /** Best-effort default/base branch, e.g. "origin/main" or "main". */
  defaultBranch: string | null;
}
