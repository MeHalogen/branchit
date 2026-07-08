/**
 * High-level repository service.
 *
 * Composes the {@link GitClient} executor with parsers to produce typed domain
 * state. This is the read/query surface the UI and workflows consume; it never
 * exposes raw git strings.
 */
import { GitClient } from "./client.js";
import { query } from "./command.js";
import { GitError } from "./errors.js";
import {
  parseForEachRefBranches,
  parseRemotes,
  parseStatusPorcelainV2,
  parseWorktreeList,
  type WorktreeEntry,
} from "./parsers.js";
import type {
  Branch,
  CommitRef,
  OperationState,
  RepositoryState,
} from "./models.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DetectResult {
  isRepo: boolean;
  root: string | null;
  gitDir: string | null;
  isBare: boolean;
}

/**
 * Determine whether `cwd` is inside a Git work tree and resolve its roots.
 * Never throws for the "not a repo" case — that is normal, expected data.
 */
export async function detectRepository(cwd: string): Promise<DetectResult> {
  const client = new GitClient({ cwd });
  const inside = await client.run(query.revParseIsInsideWorkTree());
  const bareRes = await client.run(query.revParseIsBare());
  const isBare = bareRes.ok && bareRes.stdout.trim() === "true";

  if (!inside.ok || inside.stdout.trim() !== "true") {
    // Could still be a bare repo (no work tree). Check explicitly.
    if (isBare) {
      const root = await client.run(query.revParseShowToplevel());
      const gitDir = await client.run(query.revParseGitDir());
      return {
        isRepo: true,
        root: root.ok ? root.stdout.trim() : null,
        gitDir: gitDir.ok ? gitDir.stdout.trim() : null,
        isBare: true,
      };
    }
    return { isRepo: false, root: null, gitDir: null, isBare: false };
  }

  const root = await client.run(query.revParseShowToplevel());
  const gitDir = await client.run(query.revParseGitDir());
  return {
    isRepo: true,
    root: root.ok ? root.stdout.trim() : null,
    gitDir: gitDir.ok ? gitDir.stdout.trim() : null,
    isBare,
  };
}

/** Detect an in-progress git operation from marker files in the git dir. */
export function detectOperationState(gitDir: string): OperationState {
  if (
    existsSync(join(gitDir, "rebase-merge")) ||
    existsSync(join(gitDir, "rebase-apply"))
  ) {
    return "rebase";
  }
  if (existsSync(join(gitDir, "MERGE_HEAD"))) return "merge";
  if (existsSync(join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry_pick";
  if (existsSync(join(gitDir, "REVERT_HEAD"))) return "revert";
  if (existsSync(join(gitDir, "BISECT_LOG"))) return "bisect";
  return "none";
}

export class GitRepository {
  readonly client: GitClient;
  readonly root: string;
  readonly gitDir: string;
  readonly cwd: string;
  private readonly isBare: boolean;

  constructor(params: {
    root: string;
    gitDir: string;
    cwd: string;
    isBare: boolean;
    onDebug?: (line: string) => void;
  }) {
    this.root = params.root;
    this.gitDir = params.gitDir;
    this.cwd = params.cwd;
    this.isBare = params.isBare;
    // Run git at the repo root for consistent, predictable behavior.
    this.client = new GitClient({ cwd: params.root, onDebug: params.onDebug });
  }

  /** Assemble a full repository snapshot in a small, batched set of calls. */
  async getState(): Promise<RepositoryState> {
    const [headExists, currentBranch, statusRes, remotesRes] = await Promise.all([
      this.client.run(query.headExists()),
      this.client.run(query.currentBranch()),
      this.isBare
        ? Promise.resolve(null)
        : this.client.run(query.statusPorcelain()),
      this.client.run(query.remoteVerbose()),
    ]);

    const isUnborn = !headExists.ok;
    const branchName = currentBranch.ok ? currentBranch.stdout.trim() : "";
    const isDetached = !isUnborn && branchName === "";

    let head: CommitRef | null = null;
    if (headExists.ok && headExists.stdout.trim()) {
      head = await this.getHeadCommit();
    }

    const remotes = remotesRes.ok ? parseRemotes(remotesRes.stdout) : [];
    const defaultBranch = await this.detectDefaultBranch(remotes.map((r) => r.name));

    return {
      rootPath: this.root,
      gitDir: this.gitDir,
      cwd: this.cwd,
      currentBranch: branchName || null,
      head,
      isDetached,
      isBare: this.isBare,
      isUnborn,
      operation: detectOperationState(this.gitDir),
      remotes,
      defaultBranch,
    };
  }

  /** Parsed working-tree status. Returns an empty clean tree for bare repos. */
  async getStatus() {
    if (this.isBare) {
      return parseStatusPorcelainV2("");
    }
    const res = await this.client.run(query.statusPorcelain());
    if (!res.ok) throw res.error as GitError;
    return parseStatusPorcelainV2(res.stdout);
  }

  private async getHeadCommit(): Promise<CommitRef | null> {
    const fmt =
      "%H\x1f%h\x1f%s\x1f%an\x1f%cI";
    const res = await this.client.run({
      args: ["log", "-1", "--format=" + fmt],
      display: "git log -1 --format=…",
    });
    if (!res.ok) return null;
    const f = res.stdout.trim().split("\x1f");
    if (f.length < 5) return null;
    return {
      sha: f[0] ?? "",
      shortSha: f[1] ?? "",
      subject: f[2] ?? "",
      authorName: f[3] ?? "",
      committedAt: f[4] ?? "",
    };
  }

  /** All local + remote branches with metadata, in a single git call. */
  async listBranches(): Promise<Branch[]> {
    const res = await this.client.run(query.forEachRefBranches());
    if (!res.ok) throw res.error as GitError;
    const branches = parseForEachRefBranches(res.stdout);
    // for-each-ref sets %(worktreepath) for ANY checked-out branch, including
    // the current branch in our active worktree. That is not "another worktree"
    // — clear it so only branches checked out *elsewhere* are flagged. (Path
    // equality can't be used here: rev-parse and for-each-ref disagree on
    // symlinked paths like /var vs /private/var on macOS.)
    for (const b of branches) {
      if (b.isCurrent) b.worktreePath = null;
    }
    return branches;
  }

  async listWorktrees(): Promise<WorktreeEntry[]> {
    const res = await this.client.run(query.worktreeList());
    if (!res.ok) return [];
    return parseWorktreeList(res.stdout);
  }

  /**
   * Best-effort default/base branch detection. Order:
   *   1. origin/HEAD symbolic ref (the canonical answer when present)
   *   2. same for any single remote
   *   3. origin/main, origin/master
   *   4. local main, master
   * Returns null when nothing plausible is found (caller must ask the user).
   */
  async detectDefaultBranch(remoteNames: string[]): Promise<string | null> {
    const preferredRemotes = remoteNames.includes("origin")
      ? ["origin", ...remoteNames.filter((r) => r !== "origin")]
      : remoteNames;

    for (const remote of preferredRemotes) {
      const res = await this.client.run(query.symbolicRefRemoteHead(remote));
      if (res.ok && res.stdout.trim()) return res.stdout.trim();
    }

    const candidates = [
      ...preferredRemotes.flatMap((r) => [`${r}/main`, `${r}/master`]),
      "main",
      "master",
    ];
    for (const cand of candidates) {
      const res = await this.client.run({
        args: ["rev-parse", "--verify", "--quiet", cand],
        display: `git rev-parse --verify ${cand}`,
      });
      if (res.ok && res.stdout.trim()) return cand;
    }
    return null;
  }
}
