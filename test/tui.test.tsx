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
  await repo.createBranch("feat/payment-retry");
  await repo.createBranch("fix/token-refresh");
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({
    root: detect.root!,
    gitDir: detect.gitDir!,
    cwd: repo.dir,
    isBare: false,
  });
  const data = await loadRepoData(git);
  const theme = resolveTheme({ noColor: true, ascii: true });
  const ui = render(
    <ThemeProvider value={theme}>
      <App git={git} initial={data} commandPreview={true} />
    </ThemeProvider>,
  );
  return { repo, git, ui };
}

describe("App TUI", () => {
  it("renders the dashboard with the current branch and quick actions", async () => {
    const { ui } = await setup();
    await delay(50);
    const frame = ui.lastFrame() ?? "";
    expect(frame).toContain("branchy");
    expect(frame).toContain("main");
    expect(frame).toContain("Quick actions");
    expect(frame).toContain("Switch branch");
    ui.unmount();
  });

  it("opens the switcher, filters, and switches to a branch", async () => {
    const { git, ui } = await setup();
    await delay(50);
    // Open branch switcher.
    ui.stdin.write("b");
    await delay(50);
    expect(ui.lastFrame()).toContain("Switch branch");

    // Fuzzy filter towards the payment-retry branch.
    ui.stdin.write("payret");
    await delay(50);
    const filtered = ui.lastFrame() ?? "";
    expect(filtered).toContain("feat/payment-retry");
    expect(filtered).not.toContain("fix/token-refresh");

    // Enter switches.
    ui.stdin.write("\r");
    await delay(250);

    const state = await git.getState();
    expect(state.currentBranch).toBe("feat/payment-retry");
    ui.unmount();
  });

  it("shows a command preview in the switcher", async () => {
    const { ui } = await setup();
    await delay(50);
    ui.stdin.write("b");
    await delay(30);
    ui.stdin.write("feat");
    await delay(50);
    expect(ui.lastFrame()).toContain("git switch");
    ui.unmount();
  });

  it("escape closes the switcher back to the dashboard", async () => {
    const { ui } = await setup();
    await delay(50);
    ui.stdin.write("b");
    await delay(30);
    expect(ui.lastFrame()).toContain("type to filter");
    ui.stdin.write("\x1b"); // ESC
    await delay(50);
    expect(ui.lastFrame()).toContain("Quick actions");
    ui.unmount();
  });
});
