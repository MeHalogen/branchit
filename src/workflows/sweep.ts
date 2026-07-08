/**
 * Stale-branch sweep: classification engine.
 *
 * Split into a **pure classifier** (`classifyBranch`, fully unit-testable
 * without Git) and a **data gatherer** (`gatherSweepCandidates`, which runs the
 * bounded set of Git calls needed to feed it). "Stale" is never "old" — it is
 * grounded in Git ancestry and patch-equivalence, and every candidate carries
 * an explicit confidence and human-readable reasons.
 */
import type { GitClient } from "../git/client.js";
import { query } from "../git/command.js";
import type { Branch } from "../git/models.js";

export type BranchClassification =
  | "safe_merged"
  | "squash_suspected"
  | "remote_gone"
  | "unmerged"
  | "protected"
  | "unknown";

export type Confidence = "certain" | "likely" | "low";

export type DeletionMode = "safe" | "force" | "none";

export interface SweepCandidate {
  branch: Branch;
  classification: BranchClassification;
  confidence: Confidence;
  reasons: string[];
  deletionMode: DeletionMode;
  /** Commits on the branch not reachable from base (0 for merged branches). */
  uniqueCommitCount: number;
  /** UI selection state; managed by the screen, defaulted by policy here. */
  selected: boolean;
}

export interface SweepConfig {
  base: string;
  /** Names or `prefix/*` globs. Defaults applied by the caller. */
  protectedPatterns: string[];
  currentBranch: string | null;
}

export const DEFAULT_PROTECTED = ["main", "master", "develop", "trunk"];

/** Per-branch Git-derived facts consumed by the pure classifier. */
export interface BranchMergeInfo {
  /** Tip reachable from base (git branch --merged). */
  merged: boolean;
  /** Commits on branch not in base. */
  uniqueCommitCount: number;
  /** Patch-equivalent to base but not an ancestor (git cherry has no "+"). */
  patchEquivalent: boolean;
}

/** Match a branch name against exact names and simple `prefix/*` globs. */
export function isProtectedName(name: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p === name) return true;
    if (p.endsWith("/*") && name.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

/**
 * Classify a single local branch. Pure: all Git facts arrive via `info`.
 * Preselection policy: only proven-merged, unprotected branches default to
 * selected. Everything uncertain requires an explicit choice.
 */
export function classifyBranch(
  branch: Branch,
  info: BranchMergeInfo,
  config: SweepConfig,
): SweepCandidate {
  const reasons: string[] = [];

  // Protection takes precedence over everything.
  if (branch.isCurrent) {
    return candidate(branch, "protected", "certain", ["current branch"], "none", info, false);
  }
  if (branch.worktreePath) {
    return candidate(
      branch,
      "protected",
      "certain",
      [`checked out in worktree: ${branch.worktreePath}`],
      "none",
      info,
      false,
    );
  }
  if (isProtectedName(branch.name, config.protectedPatterns)) {
    return candidate(branch, "protected", "certain", ["protected branch"], "none", info, false);
  }

  if (info.merged) {
    reasons.push(`tip reachable from ${config.base}`);
    return candidate(branch, "safe_merged", "certain", reasons, "safe", info, true);
  }

  // Not an ancestor of base, but all changes already present in base => the
  // branch was very likely squash- or rebase-merged. Suspected, not certain.
  if (info.patchEquivalent && info.uniqueCommitCount > 0) {
    reasons.push("changes appear represented in base");
    reasons.push(`not an ancestor of ${config.base}`);
    if (branch.upstream?.gone) reasons.push("upstream branch was deleted");
    return candidate(branch, "squash_suspected", "likely", reasons, "force", info, false);
  }

  if (branch.upstream?.gone) {
    reasons.push("upstream branch was deleted");
    reasons.push(`${info.uniqueCommitCount} commit(s) not in ${config.base}`);
    return candidate(branch, "remote_gone", "certain", reasons, "force", info, false);
  }

  reasons.push(`${info.uniqueCommitCount} commit(s) not in ${config.base}`);
  return candidate(branch, "unmerged", "certain", reasons, "force", info, false);
}

function candidate(
  branch: Branch,
  classification: BranchClassification,
  confidence: Confidence,
  reasons: string[],
  deletionMode: DeletionMode,
  info: BranchMergeInfo,
  selected: boolean,
): SweepCandidate {
  return {
    branch,
    classification,
    confidence,
    reasons,
    deletionMode,
    uniqueCommitCount: info.uniqueCommitCount,
    selected,
  };
}

/**
 * Gather classification for all local branches against `config.base`.
 *
 * Cost control: one `git branch --merged` for the whole repo, then extra calls
 * (`rev-list --count`, `cherry`) ONLY for branches that are neither protected
 * nor already proven merged — the bounded minority. This runs on the explicit
 * sweep action, never at launch.
 */
export async function gatherSweepCandidates(
  client: GitClient,
  branches: Branch[],
  config: SweepConfig,
): Promise<SweepCandidate[]> {
  const locals = branches.filter((b) => b.kind === "local");

  const mergedRes = await client.run(query.mergedBranches(config.base));
  const mergedSet = new Set(
    mergedRes.ok
      ? mergedRes.stdout
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

  const out: SweepCandidate[] = [];
  for (const branch of locals) {
    const protectedByPolicy =
      branch.isCurrent ||
      Boolean(branch.worktreePath) ||
      isProtectedName(branch.name, config.protectedPatterns);

    if (protectedByPolicy) {
      out.push(
        classifyBranch(branch, { merged: false, uniqueCommitCount: 0, patchEquivalent: false }, config),
      );
      continue;
    }

    if (mergedSet.has(branch.name)) {
      out.push(
        classifyBranch(branch, { merged: true, uniqueCommitCount: 0, patchEquivalent: false }, config),
      );
      continue;
    }

    // Bounded extra work for the non-merged minority.
    const [countRes, cherryRes] = await Promise.all([
      client.run(query.uniqueCommitCount(config.base, branch.name)),
      client.run(query.cherry(config.base, branch.name)),
    ]);
    const uniqueCommitCount = countRes.ok ? Number(countRes.stdout.trim() || "0") : 0;
    let patchEquivalent = false;
    if (cherryRes.ok) {
      const lines = cherryRes.stdout.split("\n").filter((l) => l.trim() !== "");
      const hasPlus = lines.some((l) => l.startsWith("+"));
      patchEquivalent = lines.length > 0 && !hasPlus;
    }
    out.push(classifyBranch(branch, { merged: false, uniqueCommitCount, patchEquivalent }, config));
  }
  return out;
}

/** Group order for display; protected shown last and de-emphasized. */
export function sweepSummary(candidates: SweepCandidate[]) {
  const safe = candidates.filter((c) => c.classification === "safe_merged");
  const review = candidates.filter(
    (c) =>
      c.classification === "squash_suspected" ||
      c.classification === "remote_gone" ||
      c.classification === "unmerged" ||
      c.classification === "unknown",
  );
  const protectedList = candidates.filter((c) => c.classification === "protected");
  return { safe, review, protected: protectedList };
}
