/**
 * Fuzzy branch ranking.
 *
 * Ranking priority is deterministic and must never let a weak fuzzy match beat
 * an obvious prefix match:
 *
 *   exact  >  prefix  >  word-boundary/token  >  subsequence (fuzzy)
 *
 * Recency (recently checked-out branches) and the current branch act as
 * tie-breakers within a tier, not across tiers.
 */

export interface Rankable {
  /** The string matched against (branch short name). */
  name: string;
  /** Lower is more recent; undefined = unknown recency. */
  recencyRank?: number;
  isCurrent?: boolean;
  /** Small per-item bonus within a tier (e.g. by result kind). Keep < 500. */
  boost?: number;
}

export interface RankedMatch<T extends Rankable> {
  item: T;
  score: number;
  /** Indices in `name` that matched, for highlighting. */
  matchedIndices: number[];
}

const TIER = {
  exact: 6000,
  prefix: 5000,
  token: 4000,
  subsequence: 2000,
  none: -1,
} as const;

/** Split a branch name into searchable tokens on / - _ and camelCase edges. */
function tokenStarts(name: string): number[] {
  const starts: number[] = [0];
  for (let i = 1; i < name.length; i++) {
    const prev = name[i - 1]!;
    const cur = name[i]!;
    if (/[/\-_.]/.test(prev)) starts.push(i);
    else if (/[a-z0-9]/.test(prev) && /[A-Z]/.test(cur)) starts.push(i);
  }
  return starts;
}

/**
 * Case-insensitive subsequence match. Returns matched indices and a quality
 * bonus favoring contiguous runs and matches at token boundaries.
 */
function subsequenceMatch(
  haystack: string,
  needle: string,
): { indices: number[]; bonus: number } | null {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const starts = new Set(tokenStarts(haystack));
  const indices: number[] = [];
  let hi = 0;
  let bonus = 0;
  let prevMatch = -2;
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni]!;
    let found = -1;
    for (; hi < h.length; hi++) {
      if (h[hi] === ch) {
        found = hi;
        hi++;
        break;
      }
    }
    if (found === -1) return null;
    indices.push(found);
    if (found === prevMatch + 1) bonus += 5; // contiguous
    if (starts.has(found)) bonus += 8; // token boundary
    prevMatch = found;
  }
  // Shorter names with the same subsequence are slightly preferred.
  bonus += Math.max(0, 20 - (haystack.length - needle.length));
  return { indices, bonus };
}

function tokenPrefixMatch(name: string, q: string): number[] | null {
  const lower = name.toLowerCase();
  const ql = q.toLowerCase();
  for (const start of tokenStarts(name)) {
    if (lower.startsWith(ql, start)) {
      const indices: number[] = [];
      for (let i = 0; i < ql.length; i++) indices.push(start + i);
      return indices;
    }
  }
  return null;
}

function recencyBonus(item: Rankable): number {
  if (item.isCurrent) return -5; // gently de-prioritize the current branch
  if (item.recencyRank === undefined) return 0;
  return Math.max(0, 50 - item.recencyRank * 5);
}

/**
 * Rank a list against a query. An empty query returns items in recency order
 * (recent first), preserving input order as a stable fallback.
 */
export function rankBranches<T extends Rankable>(items: T[], query: string): RankedMatch<T>[] {
  const q = query.trim();
  if (q === "") {
    return items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const ra = a.item.recencyRank ?? Number.MAX_SAFE_INTEGER;
        const rb = b.item.recencyRank ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      })
      .map(({ item }) => ({ item, score: 0, matchedIndices: [] }));
  }

  const ql = q.toLowerCase();
  const results: RankedMatch<T>[] = [];

  for (const item of items) {
    const name = item.name;
    const lower = name.toLowerCase();
    let score: number = TIER.none;
    let indices: number[] = [];

    if (lower === ql) {
      score = TIER.exact;
      indices = [...Array(name.length).keys()];
    } else if (lower.startsWith(ql)) {
      score = TIER.prefix + Math.max(0, 30 - (name.length - q.length));
      indices = [...Array(q.length).keys()];
    } else {
      const tokenIdx = tokenPrefixMatch(name, q);
      if (tokenIdx) {
        score = TIER.token + tokenIdx[0]! * -1; // earlier token boundary is better
        indices = tokenIdx;
      } else {
        const sub = subsequenceMatch(name, q);
        if (sub) {
          score = TIER.subsequence + sub.bonus;
          indices = sub.indices;
        }
      }
    }

    if (score > TIER.none) {
      results.push({
        item,
        score: score + recencyBonus(item) + (item.boost ?? 0),
        matchedIndices: indices,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable-ish tie-break: shorter name, then alphabetical.
    if (a.item.name.length !== b.item.name.length) return a.item.name.length - b.item.name.length;
    return a.item.name.localeCompare(b.item.name);
  });
  return results;
}
