import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { App } from "../src/app/App.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { resolveTheme } from "../src/theme/tokens.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  // One merged branch (safe) and one unmerged (needs review).
  await repo.git(["switch", "-c", "feat/merged"]);
  await repo.commitFile("m.ts", "1", "feat: merged");
  await repo.checkout("main");
  await repo.git(["merge", "--no-ff", "feat/merged", "-m", "merge"]);
  await repo.git(["switch", "-c", "experiment/unmerged"]);
  await repo.commitFile("u.ts", "1", "feat: exp");
  await repo.checkout("main");

  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const data = await loadRepoData(git);
  const ui = render(
    <ThemeProvider value={resolveTheme({ noColor: true, ascii: true })}>
      <App git={git} initial={data} commandPreview={true} />
    </ThemeProvider>,
  );
  return { repo, git, ui };
}

describe("Sweeper TUI flow", () => {
  it("opens the sweeper, previews the safe delete, and deletes the merged branch", async () => {
    const { git, ui } = await setup();
    await delay(60);

    // Open the sweeper (async scan).
    ui.stdin.write("s");
    await delay(300);
    const frame = ui.lastFrame() ?? "";
    expect(frame).toContain("Branch Sweeper");
    expect(frame).toContain("SAFE TO DELETE");
    expect(frame).toContain("feat/merged");
    // The unmerged branch must NOT be preselected.
    expect(frame).toContain("experiment/unmerged");

    // Begin delete -> confirmation modal with command preview.
    ui.stdin.write("d");
    await delay(80);
    const confirm = ui.lastFrame() ?? "";
    expect(confirm).toContain("Delete 1 branch");
    expect(confirm).toContain("git branch -d feat/merged");

    // Confirm.
    ui.stdin.write("\r");
    await delay(300);

    const branches = await git.listBranches();
    expect(branches.find((b) => b.name === "feat/merged")).toBeUndefined();
    // Unmerged branch is untouched.
    expect(branches.find((b) => b.name === "experiment/unmerged")).toBeDefined();

    // Result modal offers undo.
    expect(ui.lastFrame()).toContain("Deleted 1 branch");
    ui.unmount();
  });

  it("undoes a deletion, restoring the branch at its tip", async () => {
    const { git, ui } = await setup();
    await delay(60);
    ui.stdin.write("s");
    await delay(300);
    ui.stdin.write("d");
    await delay(80);
    ui.stdin.write("\r"); // confirm delete
    await delay(300);
    expect(ui.lastFrame()).toContain("Deleted 1 branch");

    // Undo.
    ui.stdin.write("u");
    await delay(300);
    const branches = await git.listBranches();
    expect(branches.find((b) => b.name === "feat/merged")).toBeDefined();
    ui.unmount();
  });
});
