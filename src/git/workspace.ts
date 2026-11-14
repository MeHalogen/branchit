/**
 * Working-tree operations behind the `w` (working tree), `y` (sync) screens:
 * per-file diffs, hunk-level (un)staging via `git apply --cached`, and pull
 * conflict detection with an explicit abort path.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ActionResult } from "./actions.js";
import type { GitClient } from "./client.js";
import type { GitCommand } from "./command.js";
import type { OperationState } from "./models.js";
import type { GitRepository } from "./repository.js";

function cmd(args: string[]): GitCommand {
  return { args, display: `git ${args.join(" ")}` };
}

export type PullMode = "ff-only" | "merge" | "rebase";

export const workspaceCommands = {
  diff: (path: string, staged: boolean) =>
    cmd(["diff", ...(staged ? ["--cached"] : []), "--no-color", "--no-ext-diff", "--", path]),
  applyCached: (reverse: boolean) =>
    cmd(["apply", "--cached", "--whitespace=nowarn", ...(reverse ? ["--reverse"] : []), "-"]),
  stashPaths: (message: string, paths: string[]) =>
    cmd(["stash", "push", "--include-untracked", "--message", message, "--", ...paths]),
  pull: (mode: PullMode) =>
    cmd([
      "pull",
      mode === "ff-only" ? "--ff-only" : mode === "rebase" ? "--rebase" : "--no-rebase",
    ]),
  resetKeep: (sha: string) => cmd(["reset", "--keep", sha]),
  mergeAbort: () => cmd(["merge", "--abort"]),
  rebaseAbort: () => cmd(["rebase", "--abort"]),
};

export async function fileDiffText(
  client: GitClient,
  path: string,
  staged: boolean,
): Promise<string> {
  const res = await client.run(workspaceCommands.diff(path, staged));
  return res.ok ? res.stdout : "";
}

/** Contents of an untracked file as an all-added preview (capped). */
export async function untrackedPreview(
  root: string,
  path: string,
  maxLines = 200,
): Promise<string[]> {
  try {
    const text = await readFile(join(root, path), "utf8");
    if (text.includes("\0")) return ["(binary file)"];
    return text.split("\n").slice(0, maxLines);
  } catch {
    return ["(unreadable)"];
  }
}

/** Stage (`git apply --cached`) or unstage (`--reverse`) one hunk patch. */
export async function applyHunk(
  client: GitClient,
  patch: string,
  direction: "stage" | "unstage",
): Promise<ActionResult> {
  const command = workspaceCommands.applyCached(direction === "unstage");
  const res = await client.run(command, { input: patch });
  if (res.ok) return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
  return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
}

export interface ConflictState {
  operation: Extract<OperationState, "merge" | "rebase">;
  files: string[];
  abort: GitCommand;
}

/** After a failed pull: is a merge/rebase now in progress, and on which files? */
export async function pullConflictState(git: GitRepository): Promise<ConflictState | null> {
  const [state, status] = await Promise.all([git.getState(), git.getStatus()]);
  if (state.operation !== "merge" && state.operation !== "rebase") return null;
  return {
    operation: state.operation,
    files: status.workingTree.conflicted.map((f) => f.path),
    abort:
      state.operation === "merge"
        ? workspaceCommands.mergeAbort()
        : workspaceCommands.rebaseAbort(),
  };
}
