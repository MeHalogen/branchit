/** `branchit branches [--json]` — list branches for scripts. */
import type { GitRepository } from "../git/repository.js";
import { relativeTime, sanitizeForDisplay } from "../utils/format.js";
import type { CommandIO } from "./io.js";
import { writeJson } from "./io.js";

export async function runBranchesCommand(
  git: GitRepository,
  opts: { json: boolean; all?: boolean },
  io: CommandIO,
): Promise<number> {
  const branches = (await git.listBranches()).filter((b) => opts.all || b.kind === "local");
  if (opts.json) {
    writeJson(
      io,
      branches.map((b) => ({
        name: b.name,
        kind: b.kind,
        current: b.isCurrent,
        upstream: b.upstream,
        worktreePath: b.worktreePath,
        lastCommit: b.lastCommit,
      })),
    );
    return 0;
  }
  const rows = branches.map((b) => {
    const mark = b.isCurrent ? "*" : " ";
    const up = b.upstream
      ? b.upstream.gone
        ? `${b.upstream.ref} (gone)`
        : `${b.upstream.ref} ↑${b.upstream.ahead} ↓${b.upstream.behind}`
      : "";
    const age = b.lastCommit ? relativeTime(b.lastCommit.committedAt) : "";
    return `${mark} ${sanitizeForDisplay(b.name)}\t${age}\t${up}`;
  });
  io.out(`${rows.join("\n")}\n`);
  return 0;
}
