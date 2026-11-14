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
