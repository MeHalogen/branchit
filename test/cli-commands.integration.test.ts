import { afterEach, describe, expect, it } from "vitest";
import { runBranchesCommand } from "../src/commands/branches.js";
import { createDemoRepo } from "../src/commands/demo.js";
import { runPrCommand } from "../src/commands/pr.js";
import { printStatus } from "../src/commands/status.js";
import { runSweepCommand } from "../src/commands/sweep.js";
import { runUndoCommand } from "../src/commands/undo.js";
import { loadConfig } from "../src/config/load.js";
import { defaultConfig } from "../src/config/schema.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

function capture() {
  let out = "";
  let err = "";
  return {
    io: {
      out: (s: string) => {
        out += s;
      },
      err: (s: string) => {
        err += s;
      },
    },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

async function openRepo(dir: string) {
  const detect = await detectRepository(dir);
  return new GitRepository({ root: detect.root!, gitDir: detect.gitDir!, cwd: dir, isBare: false });
}

async function scenario() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  await repo.git(["switch", "-c", "feat/merged"]);
  await repo.commitFile("m.ts", "1", "feat: merged work");
  await repo.checkout("main");
  await repo.git(["merge", "--no-ff", "feat/merged", "-m", "merge feat/merged"]);
  await repo.git(["switch", "-c", "experiment/unmerged"]);
  await repo.commitFile("u.ts", "1", "feat: experiment");
  await repo.checkout("main");
  return { repo, git: await openRepo(repo.dir) };
}

describe("branchit sweep (non-interactive)", () => {
  it("dry-run lists candidates, prints the report card, deletes nothing", async () => {
    const { repo, git } = await scenario();
    const cap = capture();
    const code = await runSweepCommand(git, defaultConfig(), { yes: false, json: false }, cap.io);
    expect(code).toBe(0);
    expect(cap.out).toContain("feat/merged");
    expect(cap.out).toContain("experiment/unmerged");
    expect(cap.out).toContain("3 branches · 1 safely merged · 1 unmerged · oldest today");
    expect(cap.out).toContain("branchit sweep --yes");
    expect(await repo.git(["branch", "--list", "feat/merged"])).toContain("feat/merged");
  });

  it("--yes deletes only safely merged branches and prints how to restore them", async () => {
    const { repo, git } = await scenario();
    const sha = (await repo.git(["rev-parse", "feat/merged"])).trim();
    const cap = capture();
    const code = await runSweepCommand(git, defaultConfig(), { yes: true, json: false }, cap.io);
    expect(code).toBe(0);
    expect(await repo.git(["branch", "--list", "feat/merged"])).toBe("");
    expect(await repo.git(["branch", "--list", "experiment/unmerged"])).toContain(
      "experiment/unmerged",
    );
    expect(cap.out).toContain(`git branch feat/merged ${sha}`);
  });

  it("--json emits parseable output including deletions", async () => {
    const { git } = await scenario();
    const cap = capture();
    await runSweepCommand(git, defaultConfig(), { yes: true, json: true }, cap.io);
    const json = JSON.parse(cap.out);
    expect(json.summary.safeMerged).toBe(1);
    expect(json.deleted).toEqual([expect.objectContaining({ name: "feat/merged", ok: true })]);
  });
});

describe("other --json commands", () => {
  it("branches --json lists local branches with the current one marked", async () => {
    const { git } = await scenario();
    const cap = capture();
    await runBranchesCommand(git, { json: true }, cap.io);
    const json = JSON.parse(cap.out);
    const names = json.map((b: { name: string }) => b.name);
    expect(names).toEqual(expect.arrayContaining(["main", "feat/merged", "experiment/unmerged"]));
    expect(json.find((b: { name: string }) => b.name === "main").current).toBe(true);
  });

  it("status --json reports branch and cleanliness", async () => {
    const { git } = await scenario();
    const cap = capture();
    await printStatus(git, { plain: false, json: true }, cap.io);
    expect(JSON.parse(cap.out)).toMatchObject({ branch: "main", clean: true, detached: false });
  });

  it("pr --json reports readiness against the base", async () => {
    const { repo, git } = await scenario();
    await repo.checkout("experiment/unmerged");
    const cap = capture();
    await runPrCommand(git, defaultConfig(), { json: true }, cap.io);
    const json = JSON.parse(cap.out);
    expect(json).toMatchObject({ head: "experiment/unmerged", base: "main", aheadOfBase: 1 });
    expect(Array.isArray(json.items)).toBe(true);
  });
});

describe("branchit demo", () => {
  it("creates a sweepable sandbox repository", async () => {
    const dir = await createDemoRepo();
    repos.push({
      cleanup: () =>
        import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true })),
    } as TempRepo);
    const git = await openRepo(dir);
    const cap = capture();
    // The demo ships a .branchit.toml with default_base = "main".
    await runSweepCommand(git, loadConfig(dir).config, { yes: false, json: true }, cap.io);
    const json = JSON.parse(cap.out);
    expect(json.base).toBe("main");
    expect(json.summary.safeMerged).toBe(4);
    expect(json.summary.squashSuspected).toBe(1);
    expect(json.summary.remoteGone + json.summary.unmerged).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe("branchit undo", () => {
  it("previews without --yes, then restores branches deleted by sweep --yes", async () => {
    const { repo, git } = await scenario();
    const sha = (await repo.git(["rev-parse", "feat/merged"])).trim();
    await runSweepCommand(git, defaultConfig(), { yes: true, json: false }, capture().io);

    const preview = capture();
    expect(await runUndoCommand(git, { yes: false, json: false, list: false }, preview.io)).toBe(0);
    expect(preview.out).toContain("Deleted branch feat/merged");
    expect(preview.out).toContain(`git branch -- feat/merged ${sha}`);
    expect(preview.out).toContain("--yes");
    expect(await repo.git(["branch", "--list", "feat/merged"])).toBe("");

    const apply = capture();
    expect(await runUndoCommand(git, { yes: true, json: false, list: false }, apply.io)).toBe(0);
    expect((await repo.git(["rev-parse", "feat/merged"])).trim()).toBe(sha);
    expect(apply.out).toContain("Undone");
  });

  it("--list shows history and --json is parseable", async () => {
    const { git } = await scenario();
    await runSweepCommand(git, defaultConfig(), { yes: true, json: false }, capture().io);
    const list = capture();
    await runUndoCommand(git, { yes: false, json: false, list: true }, list.io);
    expect(list.out).toContain("Deleted branch feat/merged");
    const json = capture();
    await runUndoCommand(git, { yes: false, json: true, list: false }, json.io);
    expect(JSON.parse(json.out)).toMatchObject({
      undoable: true,
      entry: { op: "delete-branches" },
    });
  });

  it("exits non-zero with a reason when nothing can be undone", async () => {
    const { git } = await scenario();
    const cap = capture();
    expect(await runUndoCommand(git, { yes: true, json: false, list: false }, cap.io)).toBe(1);
    expect(cap.err).toContain("Nothing to undo");
  });
});
