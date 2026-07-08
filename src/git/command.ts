/**
 * Centralized Git command construction.
 *
 * Every Git invocation in Branchy is built here as a structured
 * {@link GitCommand}: a program plus an argument array. Nothing in this file
 * ever concatenates a user-controlled value into a shell string.
 *
 * Two security rules are enforced by construction:
 *   1. Refs and paths are passed as separate argv entries (no shell parsing).
 *   2. Anything that could begin with `-` is placed after a `--` terminator
 *      so Git never interprets a branch/file name as an option.
 */

export interface GitCommand {
  /** Structured argv used for *execution*. Safe: no shell involved. */
  args: string[];
  /**
   * Human-facing preview of the command. Values that need it are quoted for
   * display only — this string is NEVER passed to a shell for execution.
   */
  display: string;
}

/** Quote a token for *display* purposes only (POSIX-ish). */
function quoteForDisplay(token: string): string {
  if (token.length === 0) return "''";
  if (/^[A-Za-z0-9_./=:@+-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, "'\\''")}'`;
}

function cmd(args: string[]): GitCommand {
  return {
    args,
    display: ["git", ...args.map(quoteForDisplay)].join(" "),
  };
}

// ── Read-only queries ──────────────────────────────────────────────────────

export const query = {
  revParseIsInsideWorkTree(): GitCommand {
    return cmd(["rev-parse", "--is-inside-work-tree"]);
  },
  revParseShowToplevel(): GitCommand {
    return cmd(["rev-parse", "--show-toplevel"]);
  },
  revParseGitDir(): GitCommand {
    return cmd(["rev-parse", "--absolute-git-dir"]);
  },
  revParseIsBare(): GitCommand {
    return cmd(["rev-parse", "--is-bare-repository"]);
  },
  currentBranch(): GitCommand {
    // Empty output => detached HEAD.
    return cmd(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  },
  headExists(): GitCommand {
    return cmd(["rev-parse", "--verify", "--quiet", "HEAD"]);
  },
  statusPorcelain(): GitCommand {
    return cmd([
      "status",
      "--porcelain=v2",
      "--branch",
      "--untracked-files=all",
      "-z",
    ]);
  },
  /**
   * All branches with rich metadata in a single batched call, using an ASCII
   * unit separator (0x1f) between fields and record separator (0x1e) between
   * refs — robust against spaces and unusual characters in ref names.
   */
  forEachRefBranches(): GitCommand {
    const FIELD = "%1f";
    const RECORD = "%1e";
    const format =
      [
        "%(refname)",
        "%(refname:short)",
        "%(HEAD)",
        "%(objectname)",
        "%(objectname:short)",
        "%(upstream)",
        "%(upstream:short)",
        "%(upstream:track,nobracket)",
        "%(contents:subject)",
        "%(authorname)",
        "%(committerdate:iso-strict)",
        "%(worktreepath)",
      ].join(FIELD) + RECORD;
    return cmd([
      "for-each-ref",
      "--format=" + format,
      "refs/heads",
      "refs/remotes",
    ]);
  },
  remoteVerbose(): GitCommand {
    return cmd(["remote", "-v"]);
  },
  symbolicRefRemoteHead(remote: string): GitCommand {
    // Resolves e.g. refs/remotes/origin/HEAD -> origin/main.
    return cmd(["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  },
  worktreeList(): GitCommand {
    return cmd(["worktree", "list", "--porcelain"]);
  },
  /** Recent HEAD reflog subjects, newest first, for recency ranking. */
  reflogCheckouts(limit: number): GitCommand {
    return cmd(["reflog", "show", "--format=%gs", "-n", String(limit), "HEAD"]);
  },
  mergedBranches(base: string): GitCommand {
    // Local branches whose tip is reachable from <base>.
    return cmd(["branch", "--merged", base, "--format=%(refname:short)"]);
  },
  /** Count of commits on <branch> not reachable from <base> (base..branch). */
  uniqueCommitCount(base: string, branch: string): GitCommand {
    return cmd(["rev-list", "--count", `${base}..${branch}`]);
  },
  /**
   * git cherry <base> <branch>: each line is "+ <sha>" (a commit whose patch is
   * NOT present in base) or "- <sha>" (patch already present, e.g. via squash or
   * cherry-pick). No "+" lines => every change is represented in base.
   */
  cherry(base: string, branch: string): GitCommand {
    return cmd(["cherry", base, branch]);
  },
  /** Commits unique to <branch> vs <base>, for the unmerged inspection view. */
  uniqueCommits(base: string, branch: string): GitCommand {
    return cmd([
      "log",
      "--format=%h\x1f%s",
      `${base}..${branch}`,
      "--max-count=50",
    ]);
  },
  aheadBehind(base: string, tip: string): GitCommand {
    // Output: "<behind>\t<ahead>" (left = base..tip? see rev-list docs).
    return cmd(["rev-list", "--left-right", "--count", `${base}...${tip}`]);
  },
};

// ── State-changing mutations ────────────────────────────────────────────────

export const mutation = {
  /** Switch to an existing local branch. `--` guards hyphen-led names. */
  switchBranch(name: string): GitCommand {
    return cmd(["switch", "--", name]);
  },
  /** Create a local tracking branch from a remote-tracking ref and switch. */
  switchTrackNew(localName: string, remoteRef: string): GitCommand {
    return cmd(["switch", "--create", localName, "--track", remoteRef]);
  },
  /** Create a new branch from a base ref and switch to it. */
  createBranch(name: string, base: string): GitCommand {
    return cmd(["switch", "--create", name, base]);
  },
  fetch(remote: string, prune: boolean): GitCommand {
    const args = ["fetch", remote];
    if (prune) args.push("--prune");
    return cmd(args);
  },
  stashPushIncludeUntracked(message: string): GitCommand {
    return cmd(["stash", "push", "--include-untracked", "--message", message]);
  },
  /** Safe delete: refuses to remove unmerged branches. */
  safeDeleteBranch(name: string): GitCommand {
    return cmd(["branch", "--delete", "--", name]);
  },
  /** Force delete: removes even unmerged branches. Confirmation is a caller concern. */
  forceDeleteBranch(name: string): GitCommand {
    return cmd(["branch", "-D", "--", name]);
  },
  /** Recreate a branch at a specific commit (used by delete-undo). */
  recreateBranch(name: string, sha: string): GitCommand {
    return cmd(["branch", "--", name, sha]);
  },
};

export const _internal = { quoteForDisplay };
