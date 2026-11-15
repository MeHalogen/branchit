
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { resolveTheme } from "../src/theme/tokens.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
const cfgDirs: string[] = [];
const prevCfg = process.env["BRANCHIT_CONFIG_DIR"];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
  await Promise.all(cfgDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  if (prevCfg === undefined) delete process.env["BRANCHIT_CONFIG_DIR"];
  else process.env["BRANCHIT_CONFIG_DIR"] = prevCfg;
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(firstRun: boolean) {
  const cfg = await mkdtemp(join(tmpdir(), "branchit-cfg-"));
  cfgDirs.push(cfg);
  process.env["BRANCHIT_CONFIG_DIR"] = cfg; // isolate onboarding state writes
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
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
      <App git={git} initial={data} commandPreview={true} firstRun={firstRun} />
    </ThemeProvider>,
  );
  return { git, ui };
}

describe("Welcome onboarding", () => {
  it("shows the welcome screen on first run and enter starts the dashboard", async () => {
    const { ui } = await setup(true);
    await delay(50);
    expect(ui.lastFrame()).toContain("Welcome to Branchit");
    ui.stdin.write("\r");
    await delay(50);
    const frame = ui.lastFrame() ?? "";
    expect(frame).toContain("Quick actions");
    expect(frame).not.toContain("Welcome to Branchit");
    ui.unmount();
  });

  it("goes straight to the dashboard when not a first run", async () => {
    const { ui } = await setup(false);
    await delay(50);
    expect(ui.lastFrame()).toContain("Quick actions");
    expect(ui.lastFrame()).not.toContain("Welcome to Branchit");
    ui.unmount();
  });
});
