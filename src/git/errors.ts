/**
 * Typed Git error taxonomy.
 *
 * Raw stderr is preserved on every error so a "show details" affordance can
 * surface it, but the UI should key off `kind` to render human-readable,
 * actionable messages rather than parsing stderr strings in components.
 */

export type GitErrorKind =
  | "not_git_repository"
  | "dirty_worktree"
  | "branch_not_found"
  | "branch_already_exists"
  | "merge_conflict"
  | "remote_unavailable"
  | "authentication_failed"
  | "permission_denied"
  | "detached_head"
  | "no_upstream"
  | "not_fully_merged"
  | "protected_branch"
  | "operation_in_progress"
  | "index_locked"
  | "checked_out_in_worktree"
  | "command_timeout"
  | "unknown_git_error";

export interface GitErrorInfo {
  kind: GitErrorKind;
  /** Concise human-readable summary suitable for a header. */
  message: string;
  /** Raw stderr captured from git, preserved verbatim for "show details". */
  raw?: string;
  exitCode?: number | null;
  /** The display form of the command that failed (never used for execution). */
  commandDisplay?: string;
}

export class GitError extends Error implements GitErrorInfo {
  readonly kind: GitErrorKind;
  readonly raw?: string;
  readonly exitCode?: number | null;
  readonly commandDisplay?: string;

  constructor(info: GitErrorInfo) {
    super(info.message);
    this.name = "GitError";
    this.kind = info.kind;
    this.raw = info.raw;
    this.exitCode = info.exitCode;
    this.commandDisplay = info.commandDisplay;
  }
}

/**
 * Classify a git failure into a known error kind by inspecting stderr.
 *
 * Git's exit codes are coarse (128 for most fatals), so stderr pattern
 * matching is the pragmatic path. Patterns are intentionally conservative:
 * anything unrecognized falls through to `unknown_git_error` with raw stderr
 * intact, so we never silently mislabel a failure.
 */
export function classifyGitStderr(stderr: string, exitCode: number | null): GitErrorKind {
  const s = stderr.toLowerCase();

  if (
    s.includes("not a git repository") ||
    s.includes("this operation must be run in a work tree")
  ) {
    return "not_git_repository";
  }
  if (s.includes("index.lock") || (s.includes("unable to create") && s.includes(".lock"))) {
    return "index_locked";
  }
  if (
    s.includes("your local changes to the following files would be overwritten") ||
    s.includes("please commit your changes or stash them") ||
    s.includes("would be overwritten by")
  ) {
    return "dirty_worktree";
  }
  if (s.includes("is already checked out at") || s.includes("checked out at")) {
    return "checked_out_in_worktree";
  }
  if (
    s.includes("did not match any") ||
    s.includes("not a valid ref") ||
    s.includes("couldn't find remote ref") ||
    s.includes("unknown revision or path")
  ) {
    return "branch_not_found";
  }
  if (s.includes("already exists")) {
    return "branch_already_exists";
  }
  if (s.includes("conflict") && (s.includes("merge") || s.includes("rebase"))) {
    return "merge_conflict";
  }
  if (
    s.includes("could not read from remote repository") ||
    s.includes("unable to access") ||
    s.includes("connection timed out") ||
    s.includes("could not resolve host")
  ) {
    return "remote_unavailable";
  }
  if (
    s.includes("authentication failed") ||
    s.includes("permission denied (publickey)") ||
    s.includes("invalid username or password")
  ) {
    return "authentication_failed";
  }
  if (s.includes("permission denied")) {
    return "permission_denied";
  }
  if (s.includes("not fully merged")) {
    // `git branch -d` refusing an unmerged branch. Callers (the sweeper) can
    // detect this specific kind to offer an explicit force-delete path.
    return "not_fully_merged";
  }
  if (exitCode === 124) {
    return "command_timeout";
  }
  return "unknown_git_error";
}

/** Map an error kind to a default concise, human-readable message. */
export function defaultMessageForKind(kind: GitErrorKind): string {
  switch (kind) {
    case "not_git_repository":
      return "Not a Git repository";
    case "dirty_worktree":
      return "Local changes would be overwritten";
    case "branch_not_found":
      return "Branch or ref not found";
    case "branch_already_exists":
      return "A branch with that name already exists";
    case "merge_conflict":
      return "Merge conflict";
    case "remote_unavailable":
      return "Could not reach the remote";
    case "authentication_failed":
      return "Authentication failed";
    case "permission_denied":
      return "Permission denied";
    case "detached_head":
      return "Detached HEAD";
    case "no_upstream":
      return "No upstream branch configured";
    case "not_fully_merged":
      return "Branch is not fully merged";
    case "protected_branch":
      return "Branch is protected";
    case "operation_in_progress":
      return "A Git operation is already in progress";
    case "index_locked":
      return "Git index is locked";
    case "checked_out_in_worktree":
      return "Branch is checked out in another worktree";
    case "command_timeout":
      return "Git command timed out";
    case "unknown_git_error":
      return "Git command failed";
  }
}
