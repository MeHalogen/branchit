import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render } from "ink-testing-library";
import {
  createRepo,
  createBareRemote,
  type TempRepo,
} from "./fixtures/gitRepo.js";
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

describe("PR readiness TUI", () => {
  it("opens the readiness checklist for the current branch", async () => {
    const remote = await createBareRemote();
    const repo = await createRepo({ initialBranch: "main" });
    repos.push(remote, repo);
    await repo.git(["remote", "add", "origin", remote.dir]);
    await repo.git(["push", "-u", "origin", "main"]);
    await repo.git(["remote", "set-head", "origin", "main"]);
    await repo.git(["switch", "-c", "feat/ready"]);
    await repo.commitFile("a.ts", "1", "feat: a");

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
    await delay(60);

    ui.stdin.write("p");
    await delay(300);
    const frame = ui.lastFrame() ?? "";
    expect(frame).toContain("PR readiness");
    expect(frame).toContain("feat/ready");
    expect(frame).toContain("origin/main");
    expect(frame).toContain("ahead of");
    // No upstream yet -> a push action should be offered.
    expect(frame).toContain("push");
    ui.unmount();
  });
});
