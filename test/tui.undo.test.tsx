import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { resolveTheme } from "../src/theme/tokens.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";
import { delay, waitForFrame, waitUntil } from "./fixtures/wait.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

async function setup(prepare?: (repo: TempRepo) => Promise<void>) {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  await repo.createBranch("dev");
  if (prepare) await prepare(repo);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const ui = render(
    <ThemeProvider value={resolveTheme({ noColor: true, ascii: true })}>
      <App git={git} initial={await loadRepoData(git)} commandPreview={true} />
    </ThemeProvider>,
  );
  await delay(60);
  return { repo, git, ui };
}

const current = async (repo: TempRepo) => (await repo.git(["branch", "--show-current"])).trim();

describe("Undo TUI", () => {
  it("says there is nothing to undo on a fresh repository", async () => {
    const { ui } = await setup();
    ui.stdin.write("u");
    await waitForFrame(ui, "Nothing to undo yet");
    ui.unmount();
  });

  it("switches, then undoes the switch from the undo screen", async () => {
    const { repo, ui } = await setup();
    ui.stdin.write("b");
    await waitForFrame(ui, "Switch branch");
    ui.stdin.write("dev");
    await delay(50);
    ui.stdin.write("\r");
    await waitUntil(async () => (await current(repo)) === "dev", "switch to dev");

    await waitForFrame(ui, "Switched to dev");
    ui.stdin.write("u");
    await waitForFrame(ui, "Switched from main to dev");
    expect(ui.lastFrame()).toContain("git switch -- main");
    ui.stdin.write("\r");
    await waitUntil(async () => (await current(repo)) === "main", "undo back to main");
    await waitForFrame(ui, "Undone");
    ui.unmount();
  });
});

describe("Recover lost work TUI", () => {
  it("restores a commit dropped by a hard reset as a new branch", async () => {
    let lost = "";
    const { repo, ui } = await setup(async (r) => {
      lost = await r.commitFile("lost.txt", "precious\n", "feat: precious work");
      await r.git(["reset", "--hard", "HEAD~1"]);
    });
    ui.stdin.write(":");
    await delay(50);
    ui.stdin.write("recover");
    await delay(50);
    ui.stdin.write("\r");
    await waitForFrame(ui, "Recover lost work");
    // Newest reflog entry is the reset; the lost commit is one below it.
    ui.stdin.write("j");
    await waitForFrame(ui, "Not on any branch");
    ui.stdin.write("\r");
    await waitForFrame(ui, "Restore as a new branch?");
    ui.stdin.write("\r");
    const name = `recovered/${lost.slice(0, 7)}`;
    await waitUntil(
      async () => (await repo.git(["branch", "--list", name])).includes(name),
      "recovered branch",
    );
    expect((await repo.git(["rev-parse", name])).trim()).toBe(lost);
    ui.unmount();
  });
});
