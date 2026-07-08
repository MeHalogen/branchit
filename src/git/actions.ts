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

export function switchTrackNew(
  client: GitClient,
  localName: string,
  remoteRef: string,
): Promise<ActionResult> {
  return runMutation(client, mutation.switchTrackNew(localName, remoteRef));
}

export function createBranch(
  client: GitClient,
  name: string,
  base: string,
): Promise<ActionResult> {
  return runMutation(client, mutation.createBranch(name, base));
}

export function stashBeforeSwitch(
  client: GitClient,
  message: string,
): Promise<ActionResult> {
  return runMutation(client, mutation.stashPushIncludeUntracked(message));
}

export function safeDeleteBranch(client: GitClient, name: string): Promise<ActionResult> {
  return runMutation(client, mutation.safeDeleteBranch(name));
}

export function forceDeleteBranch(client: GitClient, name: string): Promise<ActionResult> {
  return runMutation(client, mutation.forceDeleteBranch(name));
}
