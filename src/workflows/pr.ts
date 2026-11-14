/**
 * Pull-request readiness.
 *
 * `computePrReadiness` is pure and unit-tested: given branch/base/upstream facts
 * it produces the readiness checklist and what actions are possible.
 * `gatherPrReadiness` runs the small set of Git calls to feed it and resolves
 * the host identity + optional `gh` availability.
 */

import { execa } from "execa";
import type { GitClient } from "../git/client.js";
import { detectGitVersion } from "../git/client.js";
import { query } from "../git/command.js";
import { buildCompareUrl, parseRemoteUrl, type RepoIdentity } from "../git/host.js";
import type { RepositoryState, UpstreamInfo } from "../git/models.js";

export interface ReadinessItem {
  ok: boolean;
  label: string;
}

export interface PrReadiness {
  head: string;
  base: string;
  items: ReadinessItem[];
  aheadOfBase: number;
  behindBase: number;
  unpushed: number;
  hasUpstream: boolean;
  /** True when a push is meaningful (a remote exists). */
  canPush: boolean;
}

export interface PrReadinessInput {
  head: string;
  base: string;
  isClean: boolean;
  upstream: UpstreamInfo | null;
  aheadOfBase: number;
  behindBase: number;
  hasRemote: boolean;
}

export function computePrReadiness(input: PrReadinessInput): PrReadiness {
  const hasUpstream = input.upstream !== null && !input.upstream.gone;
  // Unpushed = local commits not on the upstream ref. Without an upstream, every
  // commit ahead of base is effectively unpushed.
  const unpushed = hasUpstream ? input.upstream!.ahead : input.aheadOfBase;

  const items: ReadinessItem[] = [];
  items.push({
    ok: input.isClean,
    label: input.isClean ? "Working tree clean" : "Working tree has uncommitted changes",
  });
  items.push({
    ok: input.aheadOfBase > 0,
    label:
      input.aheadOfBase > 0
        ? `${input.aheadOfBase} commit(s) ahead of ${input.base}`
        : `No commits ahead of ${input.base} — nothing to propose`,
  });
  items.push({
    ok: input.behindBase === 0,
    label:
      input.behindBase === 0
        ? `Up to date with ${input.base}`
        : `${input.behindBase} commit(s) behind ${input.base} — consider updating`,
  });
  items.push({
    ok: hasUpstream,
    label: hasUpstream ? "Upstream configured" : "No upstream — push will set one",
  });
  items.push({
    ok: unpushed === 0,
    label: unpushed === 0 ? "All commits pushed" : `${unpushed} local commit(s) not pushed`,
  });

  return {
    head: input.head,
    base: input.base,
    items,
    aheadOfBase: input.aheadOfBase,
    behindBase: input.behindBase,
    unpushed,
    hasUpstream,
    canPush: input.hasRemote,
  };
}

export interface PrContext {
  readiness: PrReadiness;
  identity: RepoIdentity | null;
  compareUrl: string | null;
  ghAvailable: boolean;
  /** Remote name a push would target (upstream's remote, or first remote). */
  pushRemote: string | null;
}

/** Left-right count for base...head → { behind, ahead } relative to base. */
async function baseAheadBehind(
  client: GitClient,
  base: string,
  head: string,
): Promise<{ ahead: number; behind: number }> {
  const res = await client.run(query.aheadBehind(base, head));
  if (!res.ok) return { ahead: 0, behind: 0 };
  // rev-list --left-right --count base...head => "<left>\t<right>" where
  // left = commits on base not head (behind), right = head not base (ahead).
  const [left, right] = res.stdout.trim().split(/\s+/);
  return { behind: Number(left ?? "0"), ahead: Number(right ?? "0") };
}

async function detectGh(): Promise<boolean> {
  try {
    const res = await execa("gh", ["--version"], { reject: false, shell: false });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

export async function gatherPrReadiness(
  client: GitClient,
  state: RepositoryState,
  upstream: UpstreamInfo | null,
  base: string,
): Promise<PrContext> {
  const head = state.currentBranch ?? "HEAD";
  const { ahead, behind } = await baseAheadBehind(client, base, head);

  const status = await client.run(query.statusPorcelain());
  // Cheap clean check: a single '?' or entry line means not clean. We already
  // have richer status elsewhere, but keep this self-contained.
  const isClean = status.ok
    ? status.stdout.split("\0").every((t) => t === "" || t.startsWith("# "))
    : false;

  const readiness = computePrReadiness({
    head,
    base,
    isClean,
    upstream,
    aheadOfBase: ahead,
    behindBase: behind,
    hasRemote: state.remotes.length > 0,
  });

  const pushRemote = upstream?.remoteName ?? state.remotes[0]?.name ?? null;
  const remote = state.remotes.find((r) => r.name === pushRemote) ?? state.remotes[0] ?? null;
  const identity = remote?.fetchUrl ? parseRemoteUrl(remote.fetchUrl) : null;
  const compareUrl = identity ? buildCompareUrl(identity, base, head) : null;
  const ghAvailable = identity?.host === "github" ? await detectGh() : false;

  // Keep the git version probe referenced for future compatibility gating.
  void detectGitVersion;

  return { readiness, identity, compareUrl, ghAvailable, pushRemote };
}
