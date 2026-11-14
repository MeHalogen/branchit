/**
 * Worktree manager: list worktrees with their state, compute where new ones
 * go, and build the add/remove/prune commands. Built for running several
 * branches side by side (e.g. one per coding agent).
 */
import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { GitClient } from "../git/client.js";
import type { GitCommand } from "../git/command.js";
import { parseWorktreeList } from "../git/parsers.js";
import type { GitRepository } from "../git/repository.js";

export interface WorktreeInfo {
  path: string;
  /** Short branch name, or null when detached/bare. */
  branch: string | null;
  head: string | null;
  isMain: boolean;
  /** The worktree Branchit is running in. */
  isCurrent: boolean;
  /** Uncommitted entries (staged + modified + untracked); null if unknown. */
  dirtyCount: number | null;
  ahead: number | null;
  behind: number | null;
  /** Last commit time on HEAD (ISO). */
  lastActivity: string | null;
  locked: boolean;
  prunable: boolean;
  /** Directory no longer exists on disk. */
  missing: boolean;
}

function slugBranch(branch: string): string {
  return branch
    .split("/")
    .filter((s) => s !== "" && s !== "." && s !== "..")
    .map((s) => s.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .join("-");
}

/** Git prints worktree paths with forward slashes on every platform; match it. */
export function toGitPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Expand a `[worktrees] root` template for a branch. */
export function worktreePathFor(template: string, repoRoot: string, branch: string): string {
  const expanded = template
    .replaceAll("{repo}", basename(repoRoot))
    .replaceAll("{branch}", slugBranch(branch));
  return toGitPath(isAbsolute(expanded) ? resolve(expanded) : resolve(repoRoot, expanded));
}

function cmd(args: string[]): GitCommand {
  return { args, display: `git ${args.join(" ")}` };
}

export const worktreeCommands = {
  addExisting: (path: string, branch: string) => cmd(["worktree", "add", path, branch]),
  addNew: (path: string, branch: string, base: string) =>
    cmd(["worktree", "add", "-b", branch, path, base]),
  remove: (path: string, force: boolean) =>
    cmd(["worktree", "remove", ...(force ? ["--force"] : []), path]),
  prune: () => cmd(["worktree", "prune", "--verbose"]),
};

const samePath = (a: string, b: string) =>
  resolve(a).replace(/\\/g, "/").toLowerCase() === resolve(b).replace(/\\/g, "/").toLowerCase();

async function inspect(
  path: string,
): Promise<Pick<WorktreeInfo, "dirtyCount" | "ahead" | "behind" | "lastActivity">> {
  const client = new GitClient({ cwd: path });
  const [status, counts, last] = await Promise.all([
    client.run({ args: ["status", "--porcelain"], display: "git status --porcelain" }),
    client.run({
      args: ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
      display: "git rev-list --left-right --count @{u}...HEAD",
    }),
    client.run({ args: ["log", "-1", "--format=%cI"], display: "git log -1" }),
  ]);
  let ahead: number | null = null;
  let behind: number | null = null;
  if (counts.ok) {
    const [l, r] = counts.stdout.trim().split(/\s+/);
    behind = Number(l ?? 0);
    ahead = Number(r ?? 0);
  }
  return {
    dirtyCount: status.ok ? status.stdout.split("\n").filter((l) => l.trim()).length : null,
    ahead,
    behind,
    lastActivity: last.ok ? last.stdout.trim() || null : null,
  };
}

export async function gatherWorktrees(git: GitRepository): Promise<WorktreeInfo[]> {
  const res = await git.client.run({
    args: ["worktree", "list", "--porcelain"],
    display: "git worktree list --porcelain",
  });
  if (!res.ok) return [];
  const entries = parseWorktreeList(res.stdout).filter((e) => !e.bare);
  return Promise.all(
    entries.map(async (e, i) => {
      const missing = !existsSync(e.path);
      const facts = missing
        ? { dirtyCount: null, ahead: null, behind: null, lastActivity: null }
        : await inspect(e.path);
      return {
        path: e.path,
        branch: e.branchRef?.replace(/^refs\/heads\//, "") ?? null,
        head: e.head,
        isMain: i === 0,
        isCurrent: samePath(e.path, git.root),
        locked: e.locked,
        prunable: e.prunable,
        missing,
        ...facts,
      };
    }),
  );
}
