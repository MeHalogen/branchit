import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { App } from "../src/app/App.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { resolveTheme } from "../src/theme/tokens.js";

const repos: TempRepo[] = [];
const cfgDirs: string[] = [];
const prevCfg = process.env["BRANCHY_CONFIG_DIR"];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
  await Promise.all(cfgDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  if (prevCfg === undefined) delete process.env["BRANCHY_CONFIG_DIR"];
  else process.env["BRANCHY_CONFIG_DIR"] = prevCfg;
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const typeText = async (ui: { stdin: { write: (s: string) => void } }, s: string) => {
  for (const ch of s) {
    ui.stdin.write(ch);
    await delay(6);
  }
};

async function setup(scriptBody: string, scriptName: string) {
  // Isolated, empty trust store so checks start untrusted.
  const cfg = await mkdtemp(join(tmpdir(), "branchy-cfg-"));
  cfgDirs.push(cfg);
  process.env["BRANCHY_CONFIG_DIR"] = cfg;

  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  await repo.writeFileAt(
    "package.json",
    JSON.stringify({ name: "demo", scripts: { [scriptName]: scriptBody } }),
  );
  await repo.writeFileAt("a.ts", "export const a = 1;\n");
  await repo.git(["add", "package.json", "a.ts"]);

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

// Compose down to the preview screen (files already staged -> starts at type).
async function driveToPreview(ui: { stdin: { write: (s: string) => void; }; lastFrame: () => string | undefined }) {
  await delay(60);
  ui.stdin.write("c");
  await delay(80);
  ui.stdin.write("\r"); // type (feat)
  await delay(40);
  ui.stdin.write("\r"); // scope (none)
  await delay(40);
  await typeText(ui, "add module");
  ui.stdin.write("\r"); // subject -> body
  await delay(40);
  ui.stdin.write("\r"); // body -> preview
  await delay(60);
}

describe("Pre-commit checks TUI", () => {
  it("prompts for trust, runs a passing check, then commits", async () => {
    const { repo, git, ui } = await setup("node -e \"process.exit(0)\"", "check");
    await driveToPreview(ui);
    expect(ui.lastFrame()).toContain("preview");

    ui.stdin.write("\r"); // proceed -> trust prompt (untrusted + checks present)
    await delay(80);
    const trust = ui.lastFrame() ?? "";
    expect(trust).toContain("wants to run pre-commit checks");
    expect(trust).toContain("npm run check");

    ui.stdin.write("\r"); // run once
    await delay(3000); // allow `npm run` to spin up and finish

    expect(ui.lastFrame()).toContain("Committed");
    const count = await repo.git(["rev-list", "--count", "HEAD"]);
    expect(count).toBe("2"); // initial + this commit
    const status = await git.getStatus();
    expect(status.workingTree.isClean).toBe(true);
    ui.unmount();
  });

  it("shows a failing check and allows an explicit commit-anyway", async () => {
    const { repo, ui } = await setup("node -e \"process.exit(1)\"", "lint");
    await driveToPreview(ui);

    ui.stdin.write("\r"); // proceed -> trust prompt
    await delay(80);
    ui.stdin.write("\r"); // run once
    await delay(3000);

    const failed = ui.lastFrame() ?? "";
    expect(failed).toContain("failed");
    // Nothing committed yet.
    expect(await repo.git(["rev-list", "--count", "HEAD"])).toBe("1");

    ui.stdin.write("c"); // commit anyway (explicit)
    await delay(400);
    expect(ui.lastFrame()).toContain("Committed");
    expect(await repo.git(["rev-list", "--count", "HEAD"])).toBe("2");
    ui.unmount();
  });
});
