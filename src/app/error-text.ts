import type { GitError } from "../git/errors.js";

/**
 * Translate a typed Git error into a concise, human-readable toast summary.
 * Raw stderr remains available on the error for a details view; this is the
 * one-line "what happened" a user sees first.
 */
export function toastForError(err: GitError): { message: string; detail?: string } {
  const detail = err.raw?.split("\n")[0];
  switch (err.kind) {
    case "dirty_worktree":
      return { message: "Local changes would be overwritten" };
    case "checked_out_in_worktree":
      return { message: "Branch is checked out in another worktree" };
    case "branch_not_found":
      return { message: "Branch or ref not found" };
    case "branch_already_exists":
      return { message: "A branch with that name already exists" };
    case "remote_unavailable":
      return { message: "Could not reach the remote", detail };
    case "authentication_failed":
      return { message: "Authentication failed — check your Git credentials" };
    case "not_fully_merged":
      return { message: "Branch is not fully merged" };
    case "index_locked":
      return { message: "Git index is locked — another Git process may be running" };
    case "command_timeout":
      return { message: "Git command timed out" };
    default:
      return { message: "Git command failed", detail };
  }
}
