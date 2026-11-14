import { afterEach, describe, expect, it } from "vitest";
import { bulkDeleteBranches, recreateBranches } from "../src/git/actions.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { DEFAULT_PROTECTED, gatherSweepCandidates } from "../src/workflows/sweep.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function scenario() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);

  // Merged branch (safe): create, commit, merge into main.
  await repo.git(["switch", "-c", "feat/merged"]);
  await repo.commitFile("m.ts", "1", "feat: merged work");
  await repo.checkout("main");
  await repo.git(["merge", "--no-ff", "feat/merged", "-m", "merge feat/merged"]);

  // Unmerged experiment.
  await repo.git(["switch", "-c", "experiment/unmerged"]);
  await repo.commitFile("u.ts", "1", "feat: experiment");
  await repo.checkout("main");

  // Squash-merged: apply the same change onto main as a single commit, but keep
  // the original branch (its commits are patch-equivalent but not ancestors).
  await repo.git(["switch", "-c", "feat/squashed"]);
  await repo.commitFile("s.ts", "squash-content\n", "feat: part 1");
  await repo.checkout("main");
  await repo.writeFileAt("s.ts", "squash-content\n");
  await repo.git(["add", "s.ts"]);
  await repo.git(["commit", "-m", "feat: squashed (single commit)"]);

  await repo.checkout("main");
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  return { repo, git };
}

describe("gatherSweepCandidates (real git)", () => {
  it("classifies merged, unmerged, and squash-merged branches correctly", async () => {
    const { git } = await scenario();
    const branches = await git.listBranches();
    const candidates = await gatherSweepCandidates(git.client, branches, {
      base: "main",
      protectedPatterns: [...DEFAULT_PROTECTED],
      currentBranch: "main",
    });
    const by = (name: string) => candidates.find((c) => c.branch.name === name)!;

    expect(by("feat/merged").classification).toBe("safe_merged");
    expect(by("feat/merged").selected).toBe(true);

    expect(by("experiment/unmerged").classification).toBe("unmerged");
    expect(by("experiment/unmerged").selected).toBe(false);

    expect(by("feat/squashed").classification).toBe("squash_suspected");
    expect(by("feat/squashed").confidence).toBe("likely");
    expect(by("feat/squashed").selected).toBe(false);

    expect(by("main").classification).toBe("protected");
  });

  it("safe-deletes merged branches and restores them via undo", async () => {
    const { git } = await scenario();
    const branches = await git.listBranches();
    const candidates = await gatherSweepCandidates(git.client, branches, {
      base: "main",
      protectedPatterns: [...DEFAULT_PROTECTED],
      currentBranch: "main",
    });
    const safe = candidates.find((c) => c.classification === "safe_merged")!;

    const outcomes = await bulkDeleteBranches(git.client, [
      { name: safe.branch.name, mode: "safe", restoreSha: safe.branch.lastCommit!.sha },
    ]);
    expect(outcomes[0]!.ok).toBe(true);

    let after = await git.listBranches();
    expect(after.find((b) => b.name === safe.branch.name)).toBeUndefined();

    const undo = await recreateBranches(git.client, outcomes);
    expect(undo.restored).toContain(safe.branch.name);

    after = await git.listBranches();
    expect(after.find((b) => b.name === safe.branch.name)).toBeDefined();
  });

  it("refuses a safe (-d) delete of an unmerged branch", async () => {
    const { git } = await scenario();
    const outcomes = await bulkDeleteBranches(git.client, [
      { name: "experiment/unmerged", mode: "safe", restoreSha: null },
    ]);
    expect(outcomes[0]!.ok).toBe(false);
    expect(outcomes[0]!.error?.kind).toBe("not_fully_merged");
  });

  it("force-deletes an unmerged branch only when explicitly requested", async () => {
    const { git } = await scenario();
    const outcomes = await bulkDeleteBranches(git.client, [
      { name: "experiment/unmerged", mode: "force", restoreSha: null },
    ]);
    expect(outcomes[0]!.ok).toBe(true);
  });
});
