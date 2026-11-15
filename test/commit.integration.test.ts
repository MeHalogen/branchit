import { afterEach, describe, expect, it } from "vitest";
import { commitChanges, stagePaths, unstagePaths } from "../src/git/actions.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { buildCommitMessage } from "../src/workflows/commit.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function open() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  return { repo, git };
}

describe("staging + commit (real git)", () => {
  it("stages a file and creates a real conventional commit", async () => {
    const { repo, git } = await open();
    await repo.writeFileAt("src/auth/token.ts", "export const t = 1;\n");
    await stagePaths(git.client, ["src/auth/token.ts"]);

    let status = await git.getStatus();
    expect(status.workingTree.staged.map((f) => f.path)).toContain("src/auth/token.ts");

    const message = buildCommitMessage({
      type: "feat",
      scope: "auth",
      breaking: false,
      subject: "add token module",
      body: "",
    });
    const res = await commitChanges(git.client, message);
    expect(res.ok).toBe(true);
    expect(res.subject).toBe("feat(auth): add token module");

    status = await git.getStatus();
    expect(status.workingTree.isClean).toBe(true);
    const log = await repo.git(["log", "-1", "--format=%s"]);
    expect(log).toBe("feat(auth): add token module");
  });

  it("unstages a file, leaving the working-tree change intact", async () => {
    const { repo, git } = await open();
    await repo.writeFileAt("a.ts", "1\n");
    await stagePaths(git.client, ["a.ts"]);
    await unstagePaths(git.client, ["a.ts"]);
    const status = await git.getStatus();
    expect(status.workingTree.staged).toHaveLength(0);
    expect(status.workingTree.untracked.map((f) => f.path)).toContain("a.ts");
  });

  it("surfaces a failing pre-commit hook instead of committing", async () => {
    const { repo, git } = await open();
    // Install a pre-commit hook that always fails.
    await repo.writeFileAt(
      ".git/hooks/pre-commit",
      "#!/bin/sh\necho 'lint failed: unexpected any' 1>&2\nexit 1\n",
    );
    await repo.git(["update-index", "--add", "--chmod=+x", "--", "README.md"]).catch(() => {});
    const { chmod } = await import("node:fs/promises");
    await chmod(`${repo.dir}/.git/hooks/pre-commit`, 0o755);

    await repo.writeFileAt("x.ts", "1\n");
    await stagePaths(git.client, ["x.ts"]);
    const res = await commitChanges(git.client, "feat: x\n");
    expect(res.ok).toBe(false);
    expect((res.raw ?? "").toLowerCase()).toContain("lint failed");

    // No commit should have been created beyond the initial one.
    const count = await repo.git(["rev-list", "--count", "HEAD"]);
    expect(count).toBe("1");
  });
});
