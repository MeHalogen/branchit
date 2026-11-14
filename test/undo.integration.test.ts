import { afterEach, describe, expect, it } from "vitest";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { Journal } from "../src/journal/journal.js";
import { Recorder } from "../src/journal/record.js";
import { executeUndo, planUndo, readUndoContext } from "../src/journal/undo.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function setup() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const journal = Journal.forGitDir(git.gitDir);
  return { repo, git, journal, rec: new Recorder(git, journal) };
}

async function undoLast(git: GitRepository, journal: Journal) {
  const entry = journal.lastUndoable();
  expect(entry).not.toBeNull();
  const plan = planUndo(entry!, await readUndoContext(git));
  if (!plan.ok) throw new Error(`not undoable: ${plan.reason}`);
  const res = await executeUndo(git, journal, entry!, plan);
  expect(res).toMatchObject({ ok: true });
  return res;
}

const current = async (repo: TempRepo) => (await repo.git(["branch", "--show-current"])).trim();

describe("universal undo (real git)", () => {
  it("undoes a branch switch", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.createBranch("dev");
    expect((await rec.switchBranch("dev")).ok).toBe(true);
    await undoLast(git, journal);
    expect(await current(repo)).toBe("main");
    expect(journal.lastUndoable()).toBeNull();
  });

  it("undoes create-and-switch by returning and deleting the branch", async () => {
    const { repo, git, journal, rec } = await setup();
    expect((await rec.createBranch("feat/x", "main")).ok).toBe(true);
    expect(await current(repo)).toBe("feat/x");
    await undoLast(git, journal);
    expect(await current(repo)).toBe("main");
    expect(await repo.git(["branch", "--list", "feat/x"])).toBe("");
  });

  it("undoes a commit, keeping its changes staged", async () => {
    const { repo, git, journal, rec } = await setup();
    const before = (await repo.git(["rev-parse", "HEAD"])).trim();
    await repo.writeFileAt("a.txt", "hello\n");
    await repo.git(["add", "a.txt"]);
    expect((await rec.commit("feat: add a")).ok).toBe(true);
    await undoLast(git, journal);
    expect((await repo.git(["rev-parse", "HEAD"])).trim()).toBe(before);
    expect(await repo.git(["diff", "--cached", "--name-only"])).toBe("a.txt");
  });

  it("undoes a branch deletion by recreating at the recorded tip", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.git(["switch", "-c", "old"]);
    const tip = await repo.commitFile("o.txt", "1", "feat: old");
    await repo.checkout("main");
    const { outcomes } = await rec.deleteBranches([
      { name: "old", mode: "force", restoreSha: tip },
    ]);
    expect(outcomes[0]?.ok).toBe(true);
    await undoLast(git, journal);
    expect((await repo.git(["rev-parse", "old"])).trim()).toBe(tip);
  });

  it("undoes stash-and-switch by switching back and popping the stash", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.createBranch("dev");
    await repo.writeFileAt("README.md", "# changed\n");
    await repo.writeFileAt("new.txt", "untracked\n");
    const res = await rec.stashAndSwitch("dev", "branchit: switch to dev");
    expect(res.ok).toBe(true);
    expect(await current(repo)).toBe("dev");
    await undoLast(git, journal);
    expect(await current(repo)).toBe("main");
    expect(await repo.git(["status", "--porcelain"])).toContain("README.md");
    expect(await repo.git(["stash", "list"])).toBe("");
  });

  it("records pushes as not undoable", async () => {
    const { journal } = await setup();
    journal.append({ op: "push", branch: "main", remote: "origin" });
    const plan = planUndo(journal.lastUndoable()!, {
      currentBranch: "main",
      headSha: null,
      branchTips: new Map(),
      stashShas: [],
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses a stale undo instead of clobbering later work", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.writeFileAt("a.txt", "1\n");
    await repo.git(["add", "a.txt"]);
    await rec.commit("feat: a");
    await repo.commitFile("b.txt", "2", "feat: b (outside branchit)");
    const plan = planUndo(journal.lastUndoable()!, await readUndoContext(git));
    expect(plan.ok).toBe(false);
  });
});
