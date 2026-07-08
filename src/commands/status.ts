/**
 * `branchy status [--plain]` — scriptable repository status.
 *
 * The plain form emits stable key=value lines suitable for shell scripts; the
 * default form is a short human summary. Neither launches the TUI.
 */
import type { GitRepository } from "../git/repository.js";
import { repoNameFromRoot } from "../utils/format.js";

export async function printPlainStatus(
  git: GitRepository,
  opts: { plain: boolean },
): Promise<void> {
  const [state, status, branches] = await Promise.all([
    git.getState(),
    git.getStatus(),
    git.listBranches(),
  ]);
  const current = branches.find((b) => b.kind === "local" && b.isCurrent);
  const up = current?.upstream ?? null;
  const wt = status.workingTree;

  if (opts.plain) {
    const out: string[] = [
      `repo=${repoNameFromRoot(state.rootPath)}`,
      `branch=${state.currentBranch ?? (state.isDetached ? "(detached)" : "")}`,
      `detached=${state.isDetached}`,
      `upstream=${up?.ref ?? ""}`,
      `ahead=${up?.ahead ?? 0}`,
      `behind=${up?.behind ?? 0}`,
      `staged=${wt.staged.length}`,
      `modified=${wt.unstaged.length}`,
      `untracked=${wt.untracked.length}`,
      `conflicted=${wt.conflicted.length}`,
      `clean=${wt.isClean}`,
      `operation=${state.operation}`,
    ];
    process.stdout.write(out.join("\n") + "\n");
    return;
  }

  const parts: string[] = [];
  parts.push(`${repoNameFromRoot(state.rootPath)} on ${state.currentBranch ?? "(detached)"}`);
  if (up) parts.push(`${up.ref} ↑${up.ahead} ↓${up.behind}`);
  parts.push(wt.isClean ? "clean" : `${wt.staged.length} staged, ${wt.unstaged.length} modified, ${wt.untracked.length} untracked`);
  process.stdout.write(parts.join("  ·  ") + "\n");
}
