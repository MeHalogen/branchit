/**
 * Parsers for stable, machine-readable Git output.
 *
 * We never parse human/porcelain-colored output. Status uses porcelain v2 with
 * NUL separators; branch metadata uses for-each-ref with explicit ASCII unit
 * (0x1f) and record (0x1e) separators. Both are robust against spaces and
 * unusual characters in ref and file names.
 */
import type {
  Branch,
  BranchKind,
  FileChange,
  FileStatusKind,
  HostKind,
  Remote,
  UpstreamInfo,
  WorkingTreeState,
} from "./models.js";
import { makeWorkingTree } from "./models.js";

const UNIT = "\x1f";
const RECORD = "\x1e";

// ── status --porcelain=v2 -z ────────────────────────────────────────────────

export interface StatusBranchInfo {
  oid: string | null;
  head: string | null; // branch name, or null when detached
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface ParsedStatus {
  branch: StatusBranchInfo;
  workingTree: WorkingTreeState;
}

function classifyOrdinary(xy: string): {
  staged: boolean;
  unstaged: boolean;
  kind: FileStatusKind;
} {
  const x = xy[0] ?? ".";
  const y = xy[1] ?? ".";
  const staged = x !== "." && x !== "?";
  const unstaged = y !== ".";
  // Prefer the most specific descriptor for the primary bucket.
  let kind: FileStatusKind = "modified";
  const code = staged ? x : y;
  if (code === "D") kind = "deleted";
  else if (code === "R" || code === "C") kind = "renamed";
  else if (code === "A") kind = "staged";
  else kind = "modified";
  return { staged, unstaged, kind };
}

export function parseStatusPorcelainV2(stdout: string): ParsedStatus {
  const tokens = stdout.split("\0");
  const branch: StatusBranchInfo = {
    oid: null,
    head: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
  };
  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: FileChange[] = [];
  const conflicted: FileChange[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;

    if (tok.startsWith("# ")) {
      const rest = tok.slice(2);
      if (rest.startsWith("branch.oid ")) branch.oid = rest.slice(11);
      else if (rest.startsWith("branch.head ")) {
        const h = rest.slice(12);
        if (h === "(detached)") branch.detached = true;
        else branch.head = h;
      } else if (rest.startsWith("branch.upstream ")) {
        branch.upstream = rest.slice(16);
      } else if (rest.startsWith("branch.ab ")) {
        const m = rest.slice(10).match(/\+(\d+)\s+-(\d+)/);
        if (m) {
          branch.ahead = Number(m[1]);
          branch.behind = Number(m[2]);
        }
      }
      continue;
    }

    const type = tok[0];
    if (type === "1") {
      // "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
      const parts = tok.split(" ");
      const xy = parts[1] ?? "..";
      const path = parts.slice(8).join(" ");
      const { staged: isStaged, unstaged: isUnstaged, kind } = classifyOrdinary(xy);
      if (isStaged) staged.push({ path, kind, xy });
      if (isUnstaged) unstaged.push({ path, kind, xy });
    } else if (type === "2") {
      // Rename/copy: path is in this token; origPath is the NEXT NUL field.
      const parts = tok.split(" ");
      const xy = parts[1] ?? "..";
      const path = parts.slice(9).join(" ");
      const origPath = tokens[i + 1] ?? "";
      i++; // consume origPath token
      const { staged: isStaged, unstaged: isUnstaged, kind } = classifyOrdinary(xy);
      const change: FileChange = { path, origPath, kind, xy };
      if (isStaged) staged.push(change);
      if (isUnstaged) unstaged.push(change);
    } else if (type === "u") {
      // Unmerged (conflicted).
      const parts = tok.split(" ");
      const xy = parts[1] ?? "UU";
      const path = parts.slice(10).join(" ");
      conflicted.push({ path, kind: "conflicted", xy });
    } else if (type === "?") {
      const path = tok.slice(2);
      untracked.push({ path, kind: "untracked", xy: "??" });
    }
    // "!" ignored entries are dropped.
  }

  return {
    branch,
    workingTree: makeWorkingTree({ staged, unstaged, untracked, conflicted }),
  };
}

// ── for-each-ref branch metadata ────────────────────────────────────────────

function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  const t = track.trim();
  if (t === "gone") return { ahead: 0, behind: 0, gone: true };
  let ahead = 0;
  let behind = 0;
  const am = t.match(/ahead (\d+)/);
  const bm = t.match(/behind (\d+)/);
  if (am) ahead = Number(am[1]);
  if (bm) behind = Number(bm[1]);
  return { ahead, behind, gone: false };
}

function remoteNameFromUpstream(upstreamShort: string): string {
  // e.g. "origin/feat/x" -> "origin"
  const slash = upstreamShort.indexOf("/");
  return slash === -1 ? upstreamShort : upstreamShort.slice(0, slash);
}

export function parseForEachRefBranches(stdout: string): Branch[] {
  const branches: Branch[] = [];
  const records = stdout.split(RECORD);
  for (const record of records) {
    const line = record.replace(/^\n/, "");
    if (line.trim() === "") continue;
    const f = line.split(UNIT);
    const refname = f[0] ?? "";
    const short = f[1] ?? "";
    const isHead = (f[2] ?? " ") === "*";
    const sha = f[3] ?? "";
    const shortSha = f[4] ?? "";
    const _upstreamRef = f[5] ?? "";
    const upstreamShort = f[6] ?? "";
    const track = f[7] ?? "";
    const subject = f[8] ?? "";
    const authorName = f[9] ?? "";
    const committedAt = f[10] ?? "";
    const worktreePath = f[11] ?? "";

    const kind: BranchKind = refname.startsWith("refs/heads/") ? "local" : "remote";

    // Skip the symbolic remote HEAD pseudo-ref (e.g. origin/HEAD).
    if (kind === "remote" && (short.endsWith("/HEAD") || refname.endsWith("/HEAD"))) {
      continue;
    }

    let upstream: UpstreamInfo | null = null;
    if (upstreamShort) {
      const { ahead, behind, gone } = parseTrack(track);
      upstream = {
        ref: upstreamShort,
        remoteName: remoteNameFromUpstream(upstreamShort),
        ahead,
        behind,
        gone,
      };
    }

    branches.push({
      id: refname,
      name: short,
      fullRef: refname,
      kind,
      isCurrent: isHead,
      upstream,
      lastCommit: sha ? { sha, shortSha, subject, authorName, committedAt } : null,
      worktreePath: worktreePath || null,
    });
  }
  return branches;
}

// ── remote -v ───────────────────────────────────────────────────────────────

function hostKindFromUrl(url: string): HostKind {
  const u = url.toLowerCase();
  if (u.includes("github.com")) return "github";
  if (u.includes("gitlab.com") || u.includes("gitlab")) return "gitlab";
  if (u.includes("bitbucket.org") || u.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

export function parseRemotes(stdout: string): Remote[] {
  const map = new Map<string, Remote>();
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // "origin\tgit@...:foo.git (fetch)"
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const [, name, url, dir] = m as unknown as [string, string, string, string];
    const existing =
      map.get(name) ??
      ({
        name,
        fetchUrl: null,
        pushUrl: null,
        hostKind: hostKindFromUrl(url),
      } satisfies Remote);
    if (dir === "fetch") existing.fetchUrl = url;
    else existing.pushUrl = url;
    if (existing.hostKind === "unknown") existing.hostKind = hostKindFromUrl(url);
    map.set(name, existing);
  }
  return [...map.values()];
}

// ── worktree list --porcelain ───────────────────────────────────────────────

export interface WorktreeEntry {
  path: string;
  head: string | null;
  branchRef: string | null; // e.g. refs/heads/feat/x
  bare: boolean;
  detached: boolean;
  locked: boolean;
  /** Git reports the worktree's directory is gone; `git worktree prune` cleans it. */
  prunable: boolean;
}

export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = {
        path: line.slice("worktree ".length),
        head: null,
        branchRef: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
    } else if (current) {
      if (line.startsWith("HEAD ")) current.head = line.slice(5);
      else if (line.startsWith("branch ")) current.branchRef = line.slice(7);
      else if (line === "bare") current.bare = true;
      else if (line === "detached") current.detached = true;
      else if (line === "locked" || line.startsWith("locked ")) current.locked = true;
      else if (line === "prunable" || line.startsWith("prunable ")) current.prunable = true;
    }
  }
  flush();
  return entries;
}
