/**
 * Git hosting provider abstraction (pure).
 *
 * Parses remote URLs (SSH and HTTPS forms) into a repository identity and builds
 * "compare / open a PR" URLs per host. GitHub is fully supported; GitLab is
 * best-effort; anything else yields a web base but no compare URL. Kept free of
 * GitHub-specific assumptions in the core so more providers can be added.
 */
import type { HostKind } from "./models.js";

export interface RepoIdentity {
  host: HostKind;
  owner: string;
  repo: string;
  /** e.g. https://github.com/owner/repo */
  webBase: string;
}

/**
 * Parse a Git remote URL into a {@link RepoIdentity}. Handles:
 *   - git@github.com:owner/repo.git
 *   - ssh://git@github.com/owner/repo.git
 *   - https://github.com/owner/repo.git
 *   - https://user@host/owner/repo
 * Returns null when the URL cannot be understood.
 */
export function parseRemoteUrl(url: string): RepoIdentity | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let host = "";
  let path = "";

  const scp = trimmed.match(/^[A-Za-z0-9._-]+@([^:]+):(.+)$/);
  if (scp) {
    host = scp[1]!;
    path = scp[2]!;
  } else {
    try {
      const u = new URL(trimmed);
      host = u.host.replace(/^.*@/, ""); // drop userinfo if any
      path = u.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }

  path = path.replace(/\.git$/, "").replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  // owner is the first segment; repo is the last (supports subgroups by using
  // the join for the web base but owner/repo for identity display).
  const owner = segments[0]!;
  const repo = segments[segments.length - 1]!;

  const kind = hostKind(host);
  const webBase = `https://${host}/${segments.join("/")}`;
  return { host: kind, owner, repo, webBase };
}

function hostKind(host: string): HostKind {
  const h = host.toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

/**
 * Build a URL that opens a new pull/merge request comparing base...head.
 * Returns null for hosts where we don't have a reliable format.
 */
export function buildCompareUrl(
  id: RepoIdentity,
  base: string,
  head: string,
): string | null {
  const b = encodeURIComponent(base);
  const h = encodeURIComponent(head);
  switch (id.host) {
    case "github":
      return `${id.webBase}/compare/${b}...${h}?expand=1`;
    case "gitlab":
      return `${id.webBase}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${h}&merge_request%5Btarget_branch%5D=${b}`;
    default:
      return null;
  }
}
