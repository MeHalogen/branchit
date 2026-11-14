/** `branchit worktrees [--json]` (alias `wt`) — every checkout at a glance. */
import type { GitRepository } from "../git/repository.js";
import { abbreviateHome, relativeTime, sanitizeForDisplay } from "../utils/format.js";
import { gatherWorktrees } from "../workflows/worktrees.js";
import type { CommandIO } from "./io.js";
import { writeJson } from "./io.js";

export async function runWorktreesCommand(
  git: GitRepository,
  opts: { json: boolean },
  io: CommandIO,
): Promise<number> {
  const list = await gatherWorktrees(git);
  if (opts.json) {
    writeJson(io, list);
    return 0;
  }
  const home = process.env["HOME"] ?? process.env["USERPROFILE"];
  const rows = list.map((w) => {
    const name = w.branch ?? `(detached ${w.head?.slice(0, 7) ?? "?"})`;
    const state = w.missing
      ? "missing"
      : w.dirtyCount === null
        ? "?"
        : w.dirtyCount > 0
          ? `${w.dirtyCount} changed`
          : "clean";
    const sync = w.ahead === null ? "" : `↑${w.ahead} ↓${w.behind ?? 0}`;
    const when = w.lastActivity ? relativeTime(w.lastActivity) : "";
    return [
      `${w.isCurrent ? "*" : " "} ${sanitizeForDisplay(name)}`,
      state,
      sync,
      when,
      abbreviateHome(w.path, home),
    ].join("\t");
  });
  io.out(`${rows.join("\n")}\n`);
  return 0;
}
