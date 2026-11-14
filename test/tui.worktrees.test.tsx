import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { defaultConfig } from "../src/config/schema.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { resolveTheme } from "../src/theme/tokens.js";
import { createRepo } from "./fixtures/gitRepo.js";
import { delay, waitForFrame, waitUntil } from "./fixtures/wait.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function setup() {
  const repo = await createRepo({ initialBranch: "main" });
  cleanups.push(() => repo.cleanup());
  await repo.createBranch("feat/parallel");
  const wtRoot = await realpath(await mkdtemp(join(tmpdir(), "branchit-wt-")));
  cleanups.push(() => rm(wtRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const config = defaultConfig();
  config.worktrees.root = join(wtRoot, "{branch}");
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({ root: detect.root!, gitDir: detect.gitDir!, cwd: repo.dir, isBare: false });
  const cdCalls: string[] = [];
  const ui = render(
    <ThemeProvider value={resolveTheme({ noColor: true, ascii: true })}>
      <App
        git={git}
        initial={await loadRepoData(git)}
        commandPreview={true}
        config={config}
        cdTo={(p) => {
          cdCalls.push(p);
          return true;
        }}
      />
    </ThemeProvider>,
  );
  await delay(60);
  return { repo, ui, wtRoot, cdCalls };
}

describe("Worktrees TUI (t)", () => {
  it("adds a worktree for a branch, and opens it via the shell hook", async () => {
    const { ui, wtRoot, cdCalls } = await setup();
    ui.stdin.write("t");
    await waitForFrame(ui, "Worktrees");
    await waitForFrame(ui, "1 checkout");

    ui.stdin.write("a");
    await waitForFrame(ui, "Switch branch");
    ui.stdin.write("parallel");
    await delay(50);
    ui.stdin.write("\r");
    await waitForFrame(ui, "Add worktree for feat/parallel?");
    expect(ui.lastFrame()).toContain(join(wtRoot, "feat-parallel"));
    ui.stdin.write("\r");
    const path = join(wtRoot, "feat-parallel");
    await waitUntil(() => existsSync(path), "worktree directory");
    await waitForFrame(ui, "2 checkouts");

    // Select the new worktree and open it.
    ui.stdin.write("j");
    await delay(50);
    ui.stdin.write("\r");
    await waitUntil(() => cdCalls.length === 1, "cd hook");
    expect(cdCalls[0]).toBe(path);
    ui.unmount();
  });

  it("removes a clean worktree after confirmation", async () => {
    const { repo, ui, wtRoot } = await setup();
    const path = join(wtRoot, "manual");
    await repo.git(["worktree", "add", path, "feat/parallel"]);
    ui.stdin.write("t");
    await waitForFrame(ui, "2 checkouts");
    ui.stdin.write("j");
    await waitForFrame(ui, "d remove");
    ui.stdin.write("d");
    await waitForFrame(ui, "Remove worktree feat/parallel?");
    ui.stdin.write("\r");
    await waitUntil(() => !existsSync(path), "worktree removed");
    await waitForFrame(ui, "1 checkout");
    ui.unmount();
  });
});
