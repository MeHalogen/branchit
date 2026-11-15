/**
 * Recent-branch intelligence derived from the HEAD reflog.
 *
 * We read reflog *subjects* ("checkout: moving from A to B") to reconstruct the
 * order in which branches were most recently checked out. This is Git-native
 * and requires no separate Branchit cache. First appearance (newest reflog
 * entry) wins, giving each branch a recency rank (0 = most recent).
 */
import type { GitClient } from "./client.js";
import { query } from "./command.js";

const CHECKOUT_RE = /^checkout: moving from (.+) to (.+)$/;

/** Returns a map of branch name -> recency rank (0 = most recently visited). */
export async function recentBranchRanks(
  client: GitClient,
  limit = 200,
): Promise<Map<string, number>> {
  const res = await client.run(query.reflogCheckouts(limit));
  const ranks = new Map<string, number>();
  if (!res.ok) return ranks;

  let rank = 0;
  for (const line of res.stdout.split("\n")) {
    const m = line.match(CHECKOUT_RE);
    if (!m) continue;
    // The destination of a checkout is the branch we moved *to*.
    const dest = m[2]!.trim();
    if (!ranks.has(dest)) ranks.set(dest, rank++);
  }
  return ranks;
}

export interface ReflogEntry {
  sha: string;
  /** When HEAD moved here (reflog time, not commit time). ISO-8601. */
  at: string;
  /** Reflog action, e.g. "commit: fix x", "reset: moving to HEAD~1". */
  action: string;
  /** Subject of the commit HEAD pointed at. */
  subject: string;
}

const REFLOG_FORMAT = "%H%x1f%gd%x1f%gs%x1f%s";

/** Parse `git log -g --date=iso-strict --format=REFLOG_FORMAT` output. */
export function parseReflog(stdout: string): ReflogEntry[] {
  const out: ReflogEntry[] = [];
  for (const line of stdout.split("\n")) {
    const [sha, selector, action, subject] = line.split("\x1f");
    if (!sha || !selector) continue;
    const m = selector.match(/@\{(.+)\}$/);
    out.push({ sha, at: m?.[1] ?? "", action: action ?? "", subject: subject ?? "" });
  }
  return out;
}

/** The HEAD reflog, newest first: every place HEAD has been recently. */
export async function readReflog(client: GitClient, limit = 100): Promise<ReflogEntry[]> {
  const res = await client.run({
    args: [
      "log",
      "-g",
      "--date=iso-strict",
      `--format=${REFLOG_FORMAT}`,
      "-n",
      String(limit),
      "HEAD",
    ],
    display: "git log -g HEAD",
  });
  return res.ok ? parseReflog(res.stdout) : [];
}

/** Stat preview plus which local branches (if any) still contain `sha`. */
export async function reflogPreview(
  client: GitClient,
  sha: string,
): Promise<{ branches: string[]; stat: string[] }> {
  const [contains, show] = await Promise.all([
    client.run({
      args: ["branch", "--contains", sha, "--format=%(refname:short)"],
      display: `git branch --contains ${sha}`,
    }),
    client.run({
      args: ["show", "--stat", "--format=%h %s%n%an · %ar", "--no-color", sha],
      display: `git show --stat ${sha}`,
    }),
  ]);
  return {
    branches: contains.ok ? contains.stdout.split("\n").filter(Boolean) : [],
    stat: show.ok ? show.stdout.split("\n").filter(Boolean).slice(0, 12) : [],
  };
}
