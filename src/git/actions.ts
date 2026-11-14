/**
 * State-changing Git actions.
 *
 * Thin, typed wrappers over {@link mutation} commands. Each returns a
 * discriminated result so the UI can branch on outcome without inspecting
 * stderr. Preconditions (e.g. protected-branch checks) live in the workflow
 * layer, not here — this layer just executes safely and reports.
 */
import type { GitClient } from "./client.js";
import { mutation } from "./command.js";
import type { GitError } from "./errors.js";

export type ActionResult =
  | { ok: true; commandDisplay: string; durationMs: number }
  | { ok: false; error: GitError; commandDisplay: string };

async function runMutation(
  client: GitClient,
  command: ReturnType<typeof mutation.switchBranch>,
): Promise<ActionResult> {
  const res = await client.run(command);
  if (res.ok) {
    return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
  }
  return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
}

export function switchBranch(client: GitClient, name: string): Promise<ActionResult> {
  return runMutation(client, mutation.switchBranch(name));
}

export function stagePaths(client: GitClient, paths: string[]): Promise<ActionResult> {
  if (paths.length === 0)
    return Promise.resolve({ ok: true, commandDisplay: "(noop)", durationMs: 0 });
  return runMutation(client, mutation.addPaths(paths));
}

export function unstagePaths(client: GitClient, paths: string[]): Promise<ActionResult> {
  if (paths.length === 0)
    return Promise.resolve({ ok: true, commandDisplay: "(noop)", durationMs: 0 });
  return runMutation(client, mutation.restoreStaged(paths));
}

export interface CommitResult {
  ok: boolean;
  /** Abbreviated hash of the new commit, when it could be resolved. */
  shortSha?: string;
  subject?: string;
  error?: GitError;
  /** Raw stderr, e.g. from a failing pre-commit hook. */
  raw?: string;
}

/**
 * Commit the staged index with `message` passed on stdin. Git hooks run
 * normally; a failing hook surfaces as `ok: false` with raw output preserved.
 */
export async function commitChanges(client: GitClient, message: string): Promise<CommitResult> {
  const res = await client.run(mutation.commitFromStdin(), { input: message });
  if (!res.ok) {
    return { ok: false, error: res.error, raw: res.stderr || res.stdout };
  }
  // Resolve the new commit for the success screen.
  const head = await client.run({
    args: ["log", "-1", "--format=%h\x1f%s"],
    display: "git log -1",
  });
  if (head.ok) {
    const [shortSha, subject] = head.stdout.trim().split("\x1f");
    return { ok: true, shortSha, subject };
  }
  return { ok: true };
}

export function switchTrackNew(
  client: GitClient,
  localName: string,
  remoteRef: string,
): Promise<ActionResult> {
  return runMutation(client, mutation.switchTrackNew(localName, remoteRef));
}

export function createBranch(client: GitClient, name: string, base: string): Promise<ActionResult> {
  return runMutation(client, mutation.createBranch(name, base));
}

export function stashBeforeSwitch(client: GitClient, message: string): Promise<ActionResult> {
  return runMutation(client, mutation.stashPushIncludeUntracked(message));
}

export function safeDeleteBranch(client: GitClient, name: string): Promise<ActionResult> {
  return runMutation(client, mutation.safeDeleteBranch(name));
}

export function forceDeleteBranch(client: GitClient, name: string): Promise<ActionResult> {
  return runMutation(client, mutation.forceDeleteBranch(name));
}

export interface DeleteSpec {
  name: string;
  /** "safe" uses -d (refuses unmerged); "force" uses -D. */
  mode: "safe" | "force";
  /** Tip commit before deletion, recorded so the deletion can be undone. */
  restoreSha: string | null;
}

export interface DeleteOutcome {
  name: string;
  ok: boolean;
  restoreSha: string | null;
  error?: GitError;
}

/**
 * Delete a set of branches, one at a time, collecting a per-branch outcome.
 * Never all-or-nothing: a failure on one branch does not abort the rest, and
 * the caller is handed exactly which succeeded and which did not. Each success
 * carries the tip SHA so the whole batch can be recreated (undo).
 */
export async function bulkDeleteBranches(
  client: GitClient,
  specs: DeleteSpec[],
): Promise<DeleteOutcome[]> {
  const outcomes: DeleteOutcome[] = [];
  for (const spec of specs) {
    const command =
      spec.mode === "safe"
        ? mutation.safeDeleteBranch(spec.name)
        : mutation.forceDeleteBranch(spec.name);
    const res = await client.run(command);
    outcomes.push({
      name: spec.name,
      ok: res.ok,
      restoreSha: spec.restoreSha,
      error: res.error,
    });
  }
  return outcomes;
}

/**
 * Recreate previously deleted branches at their recorded tips (undo). Returns
 * the names successfully restored and those that could not be (e.g. a name now
 * collides). Only branches with a known restore SHA are attempted.
 */
export async function recreateBranches(
  client: GitClient,
  outcomes: DeleteOutcome[],
): Promise<{ restored: string[]; failed: string[] }> {
  const restored: string[] = [];
  const failed: string[] = [];
  for (const o of outcomes) {
    if (!o.ok || !o.restoreSha) continue;
    const res = await client.run(mutation.recreateBranch(o.name, o.restoreSha));
    if (res.ok) restored.push(o.name);
    else failed.push(o.name);
  }
  return { restored, failed };
}
