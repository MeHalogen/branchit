/**
 * Remote synchronization actions (fetch/pull).
 *
 * These are the network-touching operations. They inherit the client's network
 * timeout so the UI can never hang forever, and return the same typed
 * {@link ActionResult} shape as local actions.
 */

import type { ActionResult } from "./actions.js";
import type { GitClient } from "./client.js";
import { mutation } from "./command.js";

export async function fetchRemote(
  client: GitClient,
  remote: string,
  prune: boolean,
): Promise<ActionResult> {
  const command = mutation.fetch(remote, prune);
  const res = await client.run(command);
  if (res.ok) {
    return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
  }
  return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
}

/**
 * Push the current branch. When it has no upstream, sets one on `remote`.
 * Returns the same typed ActionResult shape as other network actions.
 */
export async function pushCurrent(
  client: GitClient,
  opts: { hasUpstream: boolean; remote: string; branch: string },
): Promise<ActionResult> {
  const command = opts.hasUpstream
    ? mutation.push()
    : mutation.pushSetUpstream(opts.remote, opts.branch);
  const res = await client.run(command);
  if (res.ok) {
    return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
  }
  return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
}
