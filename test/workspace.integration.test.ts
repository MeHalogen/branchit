import { afterEach, describe, expect, it } from "vitest";
import { hunkPatch, parseDiff } from "../src/git/diff.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { listStashes } from "../src/git/stash.js";
import { applyHunk, fileDiffText, pullConflictState } from "../src/git/workspace.js";
import { Journal } from "../src/journal/journal.js";
import { Recorder } from "../src/journal/record.js";
import { executeUndo, planUndo, readUndoContext } from "../src/journal/undo.js";
import { createBareRemote, createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function open(repo: TempRepo) {
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const journal = Journal.forGitDir(git.gitDir);
  return { git, journal, rec: new Recorder(git, journal) };
}

async function setup() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  await repo.commitFile("f.txt", `${lines.join("\n")}\n`, "chore: base");
  return { repo, ...(await open(repo)) };
}

async function undoLast(git: GitRepository, journal: Journal) {
  const entry = journal.lastUndoable()!;
  const plan = planUndo(entry, await readUndoContext(git));
  if (!plan.ok) throw new Error(plan.reason);
  expect((await executeUndo(git, journal, entry, plan)).ok).toBe(true);
}

describe("hunk staging", () => {
  it("stages and unstages a single hunk of a file", async () => {
    const { repo, git } = await setup();
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    lines[1] = "line 2 CHANGED";
    lines[27] = "line 28 CHANGED";
    await repo.writeFileAt("f.txt", `${lines.join("\n")}\n`);

    const [file] = parseDiff(await fileDiffText(git.client, "f.txt", false));
    expect(file?.hunks).toHaveLength(2);
    expect((await applyHunk(git.client, hunkPatch(file!, 1), "stage")).ok).toBe(true);
    const staged = await repo.git(["diff", "--cached"]);
    expect(staged).toContain("line 28 CHANGED");
    expect(staged).not.toContain("line 2 CHANGED");

    const [stagedFile] = parseDiff(await fileDiffText(git.client, "f.txt", true));
    expect((await applyHunk(git.client, hunkPatch(stagedFile!, 0), "unstage")).ok).toBe(true);
    expect(await repo.git(["diff", "--cached"])).toBe("");
  });
});

describe("discard (stash-backed, undoable)", () => {
  it("discards tracked and untracked changes, and undo brings them back", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.writeFileAt("f.txt", "rewritten\n");
    await repo.writeFileAt("new.txt", "brand new\n");
    await repo.writeFileAt("keep.txt", "untouched\n");
    const res = await rec.discard(["f.txt", "new.txt"]);
    expect(res.ok).toBe(true);
    const status = await repo.git(["status", "--porcelain"]);
    expect(status).not.toContain("f.txt");
    expect(status).not.toContain("new.txt");
    expect(status).toContain("keep.txt");

    await undoLast(git, journal);
    const after = await repo.git(["status", "--porcelain"]);
    expect(after).toContain("f.txt");
    expect(after).toContain("new.txt");
    expect(await listStashes(git.client)).toEqual([]);
  });
});

describe("stash-backed operations never journal a stash they did not create", () => {
  it("discarding a path with no changes records nothing (an older stash is left alone)", async () => {
    const { repo, journal, rec } = await setup();
    await repo.writeFileAt("f.txt", "older work\n");
    await repo.git(["stash", "push", "--message", "someone else's stash"]);
    await rec.discard(["f.txt"]); // f.txt is clean now: nothing to stash
    expect(journal.read().filter((e) => e.op === "discard")).toEqual([]);
    expect(await repo.git(["stash", "list"])).toContain("someone else's stash");
  });
});

describe("pull", () => {
  async function withRemote() {
    const remote = await createBareRemote();
    repos.push(remote);
    const ctx = await setup();
    await ctx.repo.git(["remote", "add", "origin", remote.dir]);
    await ctx.repo.git(["push", "-u", "origin", "main"]);
    const other = await createRepo({ withInitialCommit: false });
    repos.push(other);
    await other.git(["remote", "add", "origin", remote.dir]);
    await other.git(["fetch", "origin"]);
    await other.git(["switch", "-c", "main", "--track", "origin/main"]);
    return { ...ctx, other };
  }

  it("fast-forwards, journals the pull, and undo returns to the old tip", async () => {
    const { repo, git, journal, rec, other } = await withRemote();
    const before = (await repo.git(["rev-parse", "HEAD"])).trim();
    await other.commitFile("g.txt", "g\n", "feat: from elsewhere");
    await other.git(["push", "origin", "main"]);

    const res = await rec.pull("ff-only");
    expect(res.ok).toBe(true);
    expect(await repo.git(["log", "-1", "--format=%s"])).toBe("feat: from elsewhere");
    expect(journal.lastUndoable()?.op).toBe("pull");

    await undoLast(git, journal);
    expect((await repo.git(["rev-parse", "HEAD"])).trim()).toBe(before);
  });

  it("stops on conflicts and reports the in-progress merge", async () => {
    const { repo, git, rec, other } = await withRemote();
    await other.commitFile("f.txt", "theirs\n", "feat: theirs");
    await other.git(["push", "origin", "main"]);
    await repo.commitFile("f.txt", "ours\n", "feat: ours");

    const res = await rec.pull("merge");
    expect(res.ok).toBe(false);
    const conflict = await pullConflictState(git);
    expect(conflict).toMatchObject({ operation: "merge", files: ["f.txt"] });
    expect(conflict?.abort.display).toBe("git merge --abort");
    expect((await git.client.run(conflict!.abort)).ok).toBe(true);
    expect(await repo.git(["status", "--porcelain"])).toBe("");
  });
});

describe("stash manager", () => {
  it("dropping a stash is journaled and undo stores it back", async () => {
    const { repo, git, journal, rec } = await setup();
    await repo.writeFileAt("f.txt", "wip\n");
    await repo.git(["stash", "push", "--message", "wip"]);
    const [entry] = await listStashes(git.client);
    expect((await rec.stashDrop(entry!)).ok).toBe(true);
    expect(await listStashes(git.client)).toEqual([]);
    await undoLast(git, journal);
    const back = await listStashes(git.client);
    expect(back[0]?.sha).toBe(entry!.sha);
  });
});
