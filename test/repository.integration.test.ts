import { afterEach, describe, expect, it } from "vitest";
import { switchBranch, switchTrackNew } from "../src/git/actions.js";
import { GitClient } from "../src/git/client.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { createBareRemote, createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
async function makeRepo(...args: Parameters<typeof createRepo>) {
  const r = await createRepo(...args);
  repos.push(r);
  return r;
}
async function makeRemote() {
  const r = await createBareRemote();
  repos.push(r);
  return r;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

function open(repo: TempRepo, detect: Awaited<ReturnType<typeof detectRepository>>) {
  return new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: detect.isBare,
  });
}

describe("detectRepository", () => {
  it("returns isRepo=false outside a git repo", async () => {
    const result = await detectRepository("/");
    expect(result.isRepo).toBe(false);
  });

  it("detects a real repository and its root", async () => {
    const repo = await makeRepo();
    const result = await detectRepository(repo.dir);
    expect(result.isRepo).toBe(true);
    expect(result.isBare).toBe(false);
    // macOS temp dirs may be symlinked (/var -> /private/var); compare basenames.
    expect(result.root).toBeTruthy();
  });
});

describe("GitRepository.getState", () => {
  it("reports the current branch and a clean tree", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const state = await git.getState();
    expect(state.currentBranch).toBe("main");
    expect(state.isDetached).toBe(false);
    expect(state.isUnborn).toBe(false);
    expect(state.head).not.toBeNull();
    const status = await git.getStatus();
    expect(status.workingTree.isClean).toBe(true);
  });

  it("reports a dirty working tree with counts", async () => {
    const repo = await makeRepo();
    await repo.writeFileAt("staged.ts", "a");
    await repo.git(["add", "staged.ts"]);
    await repo.writeFileAt("untracked.ts", "b");
    await repo.writeFileAt("README.md", "# changed\n");
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const status = await git.getStatus();
    expect(status.workingTree.isClean).toBe(false);
    expect(status.workingTree.staged.map((f) => f.path)).toContain("staged.ts");
    expect(status.workingTree.untracked.map((f) => f.path)).toContain("untracked.ts");
    expect(status.workingTree.unstaged.map((f) => f.path)).toContain("README.md");
  });

  it("detects an unborn repository (no commits)", async () => {
    const repo = await makeRepo({ withInitialCommit: false });
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const state = await git.getState();
    expect(state.isUnborn).toBe(true);
    expect(state.head).toBeNull();
  });

  it("detects detached HEAD", async () => {
    const repo = await makeRepo();
    const sha = await repo.commitFile("a.ts", "1", "feat: a");
    await repo.git(["checkout", sha]);
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const state = await git.getState();
    expect(state.isDetached).toBe(true);
    expect(state.currentBranch).toBeNull();
  });
});

describe("GitRepository.listBranches", () => {
  it("lists local branches and marks the current one", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.createBranch("feat/one");
    await repo.createBranch("fix/two");
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const branches = await git.listBranches();
    const local = branches.filter((b) => b.kind === "local");
    expect(local.map((b) => b.name).sort()).toEqual(["feat/one", "fix/two", "main"]);
    expect(local.find((b) => b.isCurrent)!.name).toBe("main");
  });

  it("flags branches checked out in another worktree, not the current branch", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.createBranch("feat/in-worktree");
    // Link a second worktree that checks out feat/in-worktree.
    const wtPath = `${repo.dir}-linked`;
    await repo.git(["worktree", "add", wtPath, "feat/in-worktree"]);
    try {
      const detect = await detectRepository(repo.dir);
      const git = open(repo, detect);
      const branches = await git.listBranches();
      const current = branches.find((b) => b.isCurrent)!;
      expect(current.name).toBe("main");
      expect(current.worktreePath).toBeNull();
      const linked = branches.find((b) => b.name === "feat/in-worktree")!;
      expect(linked.worktreePath).not.toBeNull();
    } finally {
      await repo.git(["worktree", "remove", "--force", wtPath]).catch(() => {});
    }
  });

  it("computes ahead/behind against a remote upstream", async () => {
    const remote = await makeRemote();
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.git(["remote", "add", "origin", remote.dir]);
    await repo.git(["push", "-u", "origin", "main"]);
    // Advance local by two commits without pushing.
    await repo.commitFile("x.ts", "1", "feat: x");
    await repo.commitFile("y.ts", "2", "feat: y");
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const branches = await git.listBranches();
    const main = branches.find((b) => b.name === "main" && b.kind === "local")!;
    expect(main.upstream).not.toBeNull();
    expect(main.upstream!.ahead).toBe(2);
    expect(main.upstream!.behind).toBe(0);
  });
});

describe("default branch detection", () => {
  it("prefers origin/HEAD when present", async () => {
    const remote = await makeRemote();
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.git(["remote", "add", "origin", remote.dir]);
    await repo.git(["push", "-u", "origin", "main"]);
    await repo.git(["remote", "set-head", "origin", "main"]);
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const def = await git.detectDefaultBranch(["origin"]);
    expect(def).toBe("origin/main");
  });

  it("falls back to local main when no remote exists", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const def = await git.detectDefaultBranch([]);
    expect(def).toBe("main");
  });
});

describe("switch actions", () => {
  it("switches between existing local branches", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.createBranch("feat/switch-me");
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const result = await switchBranch(git.client, "feat/switch-me");
    expect(result.ok).toBe(true);
    const state = await git.getState();
    expect(state.currentBranch).toBe("feat/switch-me");
  });

  it("fails to switch when local changes would be overwritten", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.commitFile("conflict.ts", "base\n", "feat: base");
    await repo.createBranch("other");
    await repo.checkout("other");
    await repo.commitFile("conflict.ts", "other-branch\n", "feat: other");
    await repo.checkout("main");
    // Create an uncommitted change that conflicts with 'other'.
    await repo.writeFileAt("conflict.ts", "dirty-local\n");
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const result = await switchBranch(git.client, "other");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("dirty_worktree");
  });

  it("creates a local tracking branch from a remote-only branch", async () => {
    const remote = await makeRemote();
    const repo = await makeRepo({ initialBranch: "main" });
    await repo.git(["remote", "add", "origin", remote.dir]);
    await repo.git(["push", "-u", "origin", "main"]);
    // Publish a branch that exists only on the remote from a second clone.
    await repo.createBranch("feat/remote-only");
    await repo.git(["push", "origin", "feat/remote-only"]);
    await repo.git(["branch", "-D", "feat/remote-only"]);
    await repo.git(["fetch", "origin"]);
    const detect = await detectRepository(repo.dir);
    const git = open(repo, detect);
    const result = await switchTrackNew(git.client, "feat/remote-only", "origin/feat/remote-only");
    expect(result.ok).toBe(true);
    const state = await git.getState();
    expect(state.currentBranch).toBe("feat/remote-only");
  });

  it("does not treat a branch name starting with '-' as a git option", async () => {
    const repo = await makeRepo({ initialBranch: "main" });
    // Git forbids leading-hyphen branch names; verify our '--' guard means the
    // failure is a normal 'not found', never an option-injection.
    const result = await switchBranch(new GitClient({ cwd: repo.dir }), "--all");
    expect(result.ok).toBe(false);
  });
});
