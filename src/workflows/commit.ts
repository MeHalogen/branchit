/**
 * Conventional-commit logic — all pure and unit-tested. The screen owns UI
 * state; message construction, scope inference, and validation live here.
 */
import type { FileChange, WorkingTreeState } from "../git/models.js";

export interface CommitType {
  name: string;
  description: string;
}

export const COMMIT_TYPES: CommitType[] = [
  { name: "feat", description: "New user-facing capability" },
  { name: "fix", description: "Bug fix" },
  { name: "docs", description: "Documentation only" },
  { name: "refactor", description: "Neither a feature nor a bug fix" },
  { name: "perf", description: "Performance improvement" },
  { name: "test", description: "Adding or fixing tests" },
  { name: "build", description: "Build system or dependencies" },
  { name: "ci", description: "CI configuration" },
  { name: "chore", description: "Maintenance / other" },
  { name: "style", description: "Formatting, no code change" },
  { name: "revert", description: "Revert a previous commit" },
];

export interface CommitDraft {
  type: string;
  scope: string; // "" = no scope
  breaking: boolean;
  subject: string;
  body: string; // "" = no body
}

/**
 * Build a Conventional Commits message:
 *   type(scope)!: subject
 *
 *   body
 *
 * A `!` marker denotes a breaking change (spec-compliant on its own); when a
 * body is present and the commit is breaking, a `BREAKING CHANGE:` footer is
 * also emitted using the subject so tooling that keys off the footer works too.
 */
export function buildCommitMessage(draft: CommitDraft): string {
  const scope = draft.scope.trim();
  const header =
    `${draft.type}${scope ? `(${scope})` : ""}${draft.breaking ? "!" : ""}: ` +
    draft.subject.trim();

  const parts = [header];
  const body = draft.body.trim();
  if (body) parts.push(body);
  if (draft.breaking) {
    parts.push(`BREAKING CHANGE: ${draft.subject.trim()}`);
  }
  return parts.join("\n\n") + "\n";
}

export interface SubjectValidation {
  ok: boolean;
  /** Non-blocking warnings (e.g. length, trailing period). */
  warnings: string[];
}

export function validateSubject(subject: string, maxLength = 72): SubjectValidation {
  const s = subject.trim();
  const warnings: string[] = [];
  if (s.length === 0) return { ok: false, warnings: ["Subject is required"] };
  if (s.length > maxLength)
    warnings.push(`Subject is ${s.length} chars (recommended ≤ ${maxLength})`);
  if (s.endsWith(".")) warnings.push("Subject ends with a period");
  return { ok: true, warnings };
}

const IGNORED_TOP_DIRS = new Set(["src", "lib", "packages", "app", "apps"]);

/**
 * Infer a suggested scope from the staged paths: the most common meaningful
 * top-level directory (descending one level past generic roots like `src/`).
 * Returns null when nothing meaningful can be inferred. Always a *suggestion*.
 */
export function inferScope(files: FileChange[]): string | null {
  const counts = new Map<string, number>();
  for (const f of files) {
    const segments = f.path.split("/").filter(Boolean);
    if (segments.length < 2) continue; // top-level file: no directory scope
    let scope = segments[0]!;
    if (IGNORED_TOP_DIRS.has(scope) && segments.length >= 3) {
      scope = segments[1]!;
    } else if (IGNORED_TOP_DIRS.has(scope)) {
      continue;
    }
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [scope, n] of counts) {
    if (n > bestN) {
      best = scope;
      bestN = n;
    }
  }
  return best;
}

/**
 * Suggest a commit type from the staged changes (deterministic, no AI):
 * docs-only → docs, tests-only → test, dependency manifests → build. Returns
 * null when nothing is confident. Only a hint; the user always confirms.
 */
export function suggestType(files: FileChange[]): string | null {
  if (files.length === 0) return null;
  const paths = files.map((f) => f.path.toLowerCase());
  const all = (pred: (p: string) => boolean) => paths.every(pred);
  const some = (pred: (p: string) => boolean) => paths.some(pred);

  if (all((p) => p.endsWith(".md") || p.startsWith("docs/"))) return "docs";
  if (all((p) => p.includes("test") || p.includes("spec") || p.startsWith("test/")))
    return "test";
  if (
    some((p) => /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|cargo\.toml|go\.mod|requirements\.txt)$/.test(p))
  )
    return "build";
  return null;
}

/** Flatten a working tree into a de-duplicated, stage-aware file list. */
export interface StageableFile {
  path: string;
  staged: boolean;
  /** Short human status: staged / modified / untracked / deleted / conflicted. */
  status: string;
}

export function stageableFiles(wt: WorkingTreeState): StageableFile[] {
  const stagedPaths = new Set(wt.staged.map((f) => f.path));
  const map = new Map<string, StageableFile>();
  const add = (f: FileChange, staged: boolean, status: string) => {
    const existing = map.get(f.path);
    if (existing) {
      existing.staged = existing.staged || staged;
      return;
    }
    map.set(f.path, { path: f.path, staged, status });
  };
  for (const f of wt.staged) add(f, true, f.kind === "deleted" ? "deleted" : "staged");
  for (const f of wt.unstaged)
    add(f, stagedPaths.has(f.path), f.kind === "deleted" ? "deleted" : "modified");
  for (const f of wt.conflicted) add(f, false, "conflicted");
  for (const f of wt.untracked) add(f, false, "untracked");
  return [...map.values()];
}
