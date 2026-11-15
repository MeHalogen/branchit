/** Display-formatting helpers shared across screens. */

/** Compact relative time: 4m, 2h, 3d, 5w, 2mo, 1y. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Absolute local timestamp for detail panels. */
export function absoluteTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/**
 * Middle-truncate a long branch name so both the meaningful prefix (type/scope)
 * and the suffix remain visible: feat/enterprise-…-retry-mechanism.
 */
export function middleTruncate(text: string, max: number): string {
  if (max <= 1) return text.slice(0, Math.max(0, max));
  if (text.length <= max) return text;
  const ell = "…";
  const keep = max - ell.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return text.slice(0, head) + ell + text.slice(text.length - tail);
}

/**
 * Strip ANSI/control escape sequences from untrusted Git metadata (branch
 * names, commit subjects) before rendering, so a malicious ref cannot inject
 * terminal control sequences into the UI. Matches C0 controls (incl. ESC),
 * DEL, and C1 controls; newlines and tabs collapse so metadata stays one line.
 *
 * Escapes keep the source free of literal control bytes.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the point
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;
export function sanitizeForDisplay(text: string): string {
  return text.replace(CONTROL_RE, "");
}

/** Home-abbreviated path for display (~/work/payments-api). */
export function abbreviateHome(path: string, home: string | undefined): string {
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

/** Repository name from its root directory. */
export function repoNameFromRoot(root: string): string {
  const parts = root.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? root;
}
