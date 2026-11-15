import { afterEach, describe, expect, it } from "vitest";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { pushCurrent } from "../src/git/sync.js";
import { gatherPrReadiness } from "../src/workflows/pr.js";
import { createBareRemote, createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function setup() {
  const remote = await createBareRemote();
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(remote, repo);
  await repo.git(["remote", "add", "origin", remote.dir]);
  await repo.git(["push", "-u", "origin", "main"]);
  await repo.git(["remote", "set-head", "origin", "main"]);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  return { remote, repo, git };
}

describe("gatherPrReadiness (real git)", () => {
  it("reports ahead-of-base and unpushed for a new feature branch", async () => {
    const { repo, git } = await setup();
    await repo.git(["switch", "-c", "feat/x"]);
    await repo.commitFile("a.ts", "1", "feat: a");
    await repo.commitFile("b.ts", "2", "feat: b");

    const state = await git.getState();
    const ctx = await gatherPrReadiness(git.client, state, null, "origin/main");
    expect(ctx.readiness.head).toBe("feat/x");
    expect(ctx.readiness.aheadOfBase).toBe(2);
    expect(ctx.readiness.behindBase).toBe(0);
    expect(ctx.readiness.hasUpstream).toBe(false);
    expect(ctx.readiness.unpushed).toBe(2);
    // origin points at our bare remote (a local path), so it is not GitHub.
    expect(ctx.readiness.canPush).toBe(true);
  });

  it("pushes a branch, sets upstream, and readiness reflects it", async () => {
    const { repo, git } = await setup();
    await repo.git(["switch", "-c", "feat/push-me"]);
    await repo.commitFile("c.ts", "1", "feat: c");

    let state = await git.getState();
    let branches = await git.listBranches();
    let current = branches.find((b) => b.isCurrent)!;
    expect(current.upstream).toBeNull();

    const res = await pushCurrent(git.client, {
      hasUpstream: false,
      remote: "origin",
      branch: "feat/push-me",
    });
    expect(res.ok).toBe(true);

    branches = await git.listBranches();
    current = branches.find((b) => b.isCurrent)!;
    expect(current.upstream).not.toBeNull();
    expect(current.upstream!.ahead).toBe(0);

    state = await git.getState();
    const ctx = await gatherPrReadiness(git.client, state, current.upstream, "origin/main");
    expect(ctx.readiness.hasUpstream).toBe(true);
    expect(ctx.readiness.unpushed).toBe(0);
    expect(ctx.readiness.items.find((i) => i.label.includes("pushed"))!.ok).toBe(true);
  });
});
