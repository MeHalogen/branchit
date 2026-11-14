import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/schema.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { Journal } from "../src/journal/journal.js";
import { Recorder } from "../src/journal/record.js";
import { executeUndo, planUndo, readUndoContext } from "../src/journal/undo.js";
import { gatherSweepCandidates, resolveSweepConfig } from "../src/workflows/sweep.js";
import { gatherWorktrees, worktreeCommands } from "../src/workflows/worktrees.js";
import { createRepo } from "./fixtures/gitRepo.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function setup() {
  const repo = await createRepo({ initialBranch: "main" });
  cleanups.push(() => repo.cleanup());
  // realpath: macOS temp dirs live behind the /var -> /private/var symlink.
  const wtRoot = await realpath(await mkdtemp(join(tmpdir(), "branchit-wt-")));
  cleanups.push(() =>
    rm(wtRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  );
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const journal = Journal.forGitDir(git.gitDir);
  return { repo, git, journal, rec: new Recorder(git, journal), wtRoot };
}

async function undoLast(git: GitRepository, journal: Journal) {
  const entry = journal.lastUndoable()!;
  const plan = planUndo(entry, await readUndoContext(git));
  if (!plan.ok) throw new Error(plan.reason);
  const res = await executeUndo(git, journal, entry, plan);
  if (!res.ok) throw new Error(JSON.stringify(res.failed));
}

describe("worktree manager (real git)", () => {
  it("lists the main worktree and added ones with dirty state", async () => {
    const { repo, git, rec, wtRoot } = await setup();
    const path = join(wtRoot, "feat-a");
    expect((await rec.addWorktree(path, "feat/a", { newBranchFrom: "main" })).ok).toBe(true);
    await repo.writeFileAt("dirty.txt", "x");
    const list = await gatherWorktrees(git);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ isMain: true, isCurrent: true, branch: "main", dirtyCount: 1 });
    expect(list[1]).toMatchObject({
      isMain: false,
      isCurrent: false,
      branch: "feat/a",
      dirtyCount: 0,
    });
    expect(list[1]?.lastActivity).toBeTruthy();
  });

  it("undoing add removes the worktree and the branch it created", async () => {
    const { repo, git, journal, rec, wtRoot } = await setup();
    const path = join(wtRoot, "feat-b");
    await rec.addWorktree(path, "feat/b", { newBranchFrom: "main" });
    await undoLast(git, journal);
    expect(existsSync(path)).toBe(false);
    expect(await repo.git(["branch", "--list", "feat/b"])).toBe("");
  });

  it("removes a clean worktree (undoable) but refuses a dirty one without force", async () => {
    const { repo, git, journal, rec, wtRoot } = await setup();
    await repo.createBranch("feat/c");
    const path = join(wtRoot, "feat-c");
    await rec.addWorktree(path, "feat/c");
    let wt = (await gatherWorktrees(git)).find((w) => w.branch === "feat/c")!;
    expect((await rec.removeWorktree(wt, false)).ok).toBe(true);
    expect(existsSync(path)).toBe(false);
    await undoLast(git, journal);
    expect(existsSync(path)).toBe(true);

    await repo.git(["-C", path, "status"]);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(path, "wip.txt"), "unsaved");
    wt = (await gatherWorktrees(git)).find((w) => w.branch === "feat/c")!;
    expect(wt.dirtyCount).toBe(1);
    expect((await rec.removeWorktree(wt, false)).ok).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it("prunes worktrees whose directory was deleted", async () => {
    const { git, rec, wtRoot } = await setup();
    const path = join(wtRoot, "gone");
    await rec.addWorktree(path, "feat/gone", { newBranchFrom: "main" });
    await rm(path, { recursive: true, force: true });
    const stale = (await gatherWorktrees(git)).find((w) => w.branch === "feat/gone");
    expect(stale?.missing).toBe(true);
    expect((await git.client.run(worktreeCommands.prune())).ok).toBe(true);
    expect((await gatherWorktrees(git)).some((w) => w.branch === "feat/gone")).toBe(false);
  });

  it("sweep removes a merged branch together with its clean worktree, and undo restores both", async () => {
    const { repo, git, journal, rec, wtRoot } = await setup();
    const path = join(wtRoot, "done");
    await rec.addWorktree(path, "feat/done", { newBranchFrom: "main" });
    // Branch tip == main tip, so it is merged.
    const cfg = resolveSweepConfig(defaultConfig().branches, "main", "main")!;
    const candidates = await gatherSweepCandidates(git.client, await git.listBranches(), cfg);
    const c = candidates.find((x) => x.branch.name === "feat/done")!;
    expect(c).toMatchObject({ classification: "safe_merged", selected: false, worktreePath: path });

    const { outcomes } = await rec.deleteBranches([
      {
        name: "feat/done",
        mode: "safe",
        restoreSha: c.branch.lastCommit!.sha,
        worktreePath: c.worktreePath,
      },
    ]);
    expect(outcomes[0]?.ok).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(await repo.git(["branch", "--list", "feat/done"])).toBe("");

    await undoLast(git, journal);
    expect(existsSync(path)).toBe(true);
    expect(await repo.git(["branch", "--list", "feat/done"])).toContain("feat/done");
  });
});
