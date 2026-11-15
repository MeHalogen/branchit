import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App.js";
import { loadRepoData } from "../src/app/loadRepo.js";
import { ThemeProvider } from "../src/app/theme-context.js";
import { defaultConfig, type ResolvedConfig } from "../src/config/schema.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import { installKeymap, resolveKeymap } from "../src/keys/registry.js";
import { resolveTheme } from "../src/theme/tokens.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";
import { delay, waitForFrame } from "./fixtures/wait.js";

const cleanups: (() => Promise<void>)[] = [];
const prevCfg = process.env["BRANCHIT_CONFIG_DIR"];
let cfgDir = "";
beforeEach(async () => {
  cfgDir = await mkdtemp(join(tmpdir(), "branchit-cfg-"));
  process.env["BRANCHIT_CONFIG_DIR"] = cfgDir;
});
afterEach(async () => {
  installKeymap(resolveKeymap({}).shortcuts);
  for (const c of cleanups.splice(0).reverse()) await c();
  await rm(cfgDir, { recursive: true, force: true });
  if (prevCfg === undefined) delete process.env["BRANCHIT_CONFIG_DIR"];
  else process.env["BRANCHIT_CONFIG_DIR"] = prevCfg;
});

async function mount(config: ResolvedConfig, prepare?: (r: TempRepo) => Promise<void>) {
  const repo = await createRepo({ initialBranch: "main" });
  cleanups.push(() => repo.cleanup());
  if (prepare) await prepare(repo);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({ root: detect.root!, gitDir: detect.gitDir!, cwd: repo.dir, isBare: false });
  const ui = render(
    <ThemeProvider value={resolveTheme({ noColor: true, ascii: true })}>
      <App git={git} initial={await loadRepoData(git)} commandPreview={true} config={config} />
    </ThemeProvider>,
  );
  cleanups.push(async () => ui.unmount());
  await delay(60);
  return { repo, ui };
}

describe("AI commit message (ctrl+g)", () => {
  it("asks for trust, pipes the staged diff, and fills the form", async () => {
    const scriptDir = await mkdtemp(join(tmpdir(), "branchit-ai-"));
    cleanups.push(() => rm(scriptDir, { recursive: true, force: true }));
    const script = join(scriptDir, "fake-llm.mjs");
    await writeFile(
      script,
      `let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const f=(d.match(/\\+\\+\\+ b\\/(\\S+)/)||[])[1];console.log("feat(core): describe "+f+"\\n\\nGenerated body.")});`,
    );
    const config = defaultConfig();
    config.ai.command = `node "${script}"`;
    const { ui } = await mount(config, async (r) => {
      await r.writeFileAt("thing.ts", "export const x = 1;\n");
      await r.git(["add", "thing.ts"]);
    });

    ui.stdin.write("c");
    await waitForFrame(ui, "ctrl+g suggest a message with node");
    ui.stdin.write("\u0007"); // ctrl+g
    await waitForFrame(ui, "Run this command with your staged diff on stdin?");
    ui.stdin.write("t");
    await waitForFrame(ui, "describe thing.ts");
    expect(ui.lastFrame()).toContain("feat(core)");
  });
});

describe("[keys] overrides", () => {
  it("rebinds sweep to x and shows it in the status bar", async () => {
    const { shortcuts, errors } = resolveKeymap({ sweep: "x" });
    expect(errors).toEqual([]);
    installKeymap(shortcuts);
    const { ui } = await mount(defaultConfig());
    await waitForFrame(ui, "x sweep");
    ui.stdin.write("x");
    await waitForFrame(ui, "Branch Sweeper");
  });
});
