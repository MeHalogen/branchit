/**
 * `branchit status [--plain|--json]` — scriptable repository status.
 *
 * The plain form emits stable key=value lines suitable for shell scripts; the
 * default form is a short human summary. Neither launches the TUI.
 */
import type { GitRepository } from "../git/repository.js";
import { repoNameFromRoot } from "../utils/format.js";
import { type CommandIO, processIO, writeJson } from "./io.js";

export async function printStatus(
  git: GitRepository,
  opts: { plain: boolean; json?: boolean },
  io: CommandIO = processIO,
): Promise<void> {
  const [state, status, branches] = await Promise.all([
    git.getState(),
    git.getStatus(),
    git.listBranches(),
  ]);
  const current = branches.find((b) => b.kind === "local" && b.isCurrent);
  const up = current?.upstream ?? null;
  const wt = status.workingTree;

  if (opts.json) {
    writeJson(io, {
      repo: repoNameFromRoot(state.rootPath),
      root: state.rootPath,
      branch: state.currentBranch,
      detached: state.isDetached,
      upstream: up?.ref ?? null,
      ahead: up?.ahead ?? 0,
      behind: up?.behind ?? 0,
      staged: wt.staged.map((f) => f.path),
      modified: wt.unstaged.map((f) => f.path),
      untracked: wt.untracked.map((f) => f.path),
      conflicted: wt.conflicted.map((f) => f.path),
      clean: wt.isClean,
      operation: state.operation,
    });
    return;
  }

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
    io.out(`${out.join("\n")}\n`);
    return;
  }

  const parts: string[] = [];
  parts.push(`${repoNameFromRoot(state.rootPath)} on ${state.currentBranch ?? "(detached)"}`);
  if (up) parts.push(`${up.ref} ↑${up.ahead} ↓${up.behind}`);
  parts.push(
    wt.isClean
      ? "clean"
      : `${wt.staged.length} staged, ${wt.unstaged.length} modified, ${wt.untracked.length} untracked`,
  );
  io.out(`${parts.join("  ·  ")}\n`);
}
