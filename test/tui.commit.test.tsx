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
const type = async (ui: { stdin: { write: (s: string) => void } }, s: string) => {
  for (const ch of s) {
    ui.stdin.write(ch);
    await delay(8);
  }
};
/** Poll the last frame until it contains `needle`, or fail after `timeout`. */
async function waitFor(
  ui: { lastFrame: () => string | undefined },
  needle: string,
  timeout = 4000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((ui.lastFrame() ?? "").includes(needle)) {
      // Let ink re-subscribe its input handler for the newly rendered stage
      // before the caller sends the next keystroke (handlers re-register in a
      // post-render effect, one tick after the frame commits).
      await delay(50);
      return;
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for "${needle}". Frame:\n${ui.lastFrame()}`);
}

async function setup(withStaged: boolean) {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  await repo.writeFileAt("src/auth/token.ts", "export const t = 1;\n");
  if (withStaged) await repo.git(["add", "src/auth/token.ts"]);

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

describe("Commit TUI flow", () => {
  it("stages a file, composes a conventional commit, and commits for real", async () => {
    const { repo, git, ui } = await setup(false);
    await delay(60);

    ui.stdin.write("c"); // open commit
    await waitFor(ui, "select files");
    await delay(80); // let CommitFlow's input handler register before typing

    ui.stdin.write(" "); // include the untracked file
    await waitFor(ui, "1 file(s) will be committed");
    ui.stdin.write("\r"); // reconcile staging -> type stage
    await waitFor(ui, "Commit  ·  type");

    ui.stdin.write("\r"); // choose feat -> scope
    // Scope is inferred as "auth" from src/auth/…; accept it with Enter.
    await waitFor(ui, "suggested");
    ui.stdin.write("\r"); // scope -> subject
    await waitFor(ui, "Commit  ·  subject");
    await type(ui, "add token module");
    ui.stdin.write("\r"); // subject -> body
    await waitFor(ui, "Commit  ·  body");
    ui.stdin.write("\r"); // skip body -> preview
    await waitFor(ui, "Commit  ·  preview");
    const preview = ui.lastFrame() ?? "";
    expect(preview).toContain("feat(auth): add token module");
    expect(preview).toContain("git commit -F -");

    ui.stdin.write("\r"); // commit
    await waitFor(ui, "Committed");

    const subject = await repo.git(["log", "-1", "--format=%s"]);
    expect(subject).toBe("feat(auth): add token module");
    const status = await git.getStatus();
    expect(status.workingTree.isClean).toBe(true);
    ui.unmount();
  });

  it("starts at the type step when changes are already staged", async () => {
    const { ui } = await setup(true);
    await delay(60);
    ui.stdin.write("c");
    await delay(80);
    // Should skip the file-selection step.
    expect(ui.lastFrame()).toContain("type");
    expect(ui.lastFrame()).not.toContain("select files");
    ui.unmount();
  });
});
