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

const LINES = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);

async function setup(prepare?: (repo: TempRepo) => Promise<void>) {
  const repo = await createRepo({ initialBranch: "main" });
  repos.push(repo);
  await repo.commitFile("f.txt", `${LINES.join("\n")}\n`, "chore: base");
  await repo.createBranch("feat/searchable-thing");
  if (prepare) await prepare(repo);
  const detect = await detectRepository(repo.dir);
  const git = new GitRepository({ root: detect.root!, gitDir: detect.gitDir!, cwd: repo.dir, isBare: false });
  const ui = render(
    <ThemeProvider value={resolveTheme({ noColor: true, ascii: true })}>
      <App git={git} initial={await loadRepoData(git)} commandPreview={true} />
    </ThemeProvider>,
  );
  await delay(60);
  return { repo, git, ui };
}

async function twoHunks(repo: TempRepo) {
  const lines = [...LINES];
  lines[1] = "line 2 CHANGED";
  lines[27] = "line 28 CHANGED";
  await repo.writeFileAt("f.txt", `${lines.join("\n")}\n`);
}

describe("Working tree TUI (w)", () => {
  it("stages a whole file with space", async () => {
    const { repo, ui } = await setup(async (r) => r.writeFileAt("new.txt", "hello\n"));
    ui.stdin.write("w");
    await waitForFrame(ui, "Working tree");
    await waitForFrame(ui, "+hello");
    ui.stdin.write(" ");
    await waitUntil(async () => (await repo.git(["diff", "--cached", "--name-only"])) === "new.txt", "staged new.txt");
    ui.unmount();
  });

  it("stages a single hunk from the diff pane", async () => {
    const { repo, ui } = await setup(twoHunks);
    ui.stdin.write("w");
    await waitForFrame(ui, "hunk 1/2");
    ui.stdin.write("\r"); // focus diff
    await delay(50);
    ui.stdin.write("n"); // second hunk
    await waitForFrame(ui, "hunk 2/2");
    ui.stdin.write("s");
    await waitUntil(async () => (await repo.git(["diff", "--cached"])).includes("line 28 CHANGED"), "hunk staged");
    expect(await repo.git(["diff", "--cached"])).not.toContain("line 2 CHANGED");
    ui.unmount();
  });

  it("discards a file, then undo brings it back", async () => {
    const { repo, ui } = await setup(twoHunks);
    ui.stdin.write("w");
    await waitForFrame(ui, "x discard");
    ui.stdin.write("x");
    await waitForFrame(ui, "Discard changes to f.txt?");
    ui.stdin.write("\r");
    await waitUntil(async () => (await repo.git(["status", "--porcelain"])) === "", "clean tree", 5000, () => ui.lastFrame() ?? "");
    await waitForFrame(ui, "Working tree clean");
    ui.stdin.write("\u001b"); // esc to dashboard
    await waitForFrame(ui, "Quick actions");
    ui.stdin.write("u");
    await waitForFrame(ui, "Discarded changes to f.txt");
    ui.stdin.write("\r");
    await waitUntil(async () => (await repo.git(["status", "--porcelain"])).includes("f.txt"), "restored");
    ui.unmount();
  });
});

describe("Search (/)", () => {
  it("finds a branch by fuzzy name and switches to it", async () => {
    const { repo, ui } = await setup();
    ui.stdin.write("/");
    await waitForFrame(ui, "search branches, commands");
    ui.stdin.write("searchable");
    await waitForFrame(ui, "feat/searchable-thing");
    ui.stdin.write("\r");
    await waitUntil(
      async () => (await repo.git(["branch", "--show-current"])) === "feat/searchable-thing",
      "switch via search",
    );
    ui.unmount();
  });

  it("finds commits by subject", async () => {
    const { ui } = await setup();
    ui.stdin.write("/");
    await waitForFrame(ui, "search branches, commands");
    ui.stdin.write("chore: base");
    await waitForFrame(ui, "commit");
    ui.stdin.write("\r");
    await waitForFrame(ui, "Branch from here");
    ui.unmount();
  });
});

describe("Stash manager (z) and sync (y)", () => {
  it("lists, previews and drops a stash; undo stores it back", async () => {
    const { repo, ui } = await setup(async (r) => {
      await r.writeFileAt("f.txt", "wip\n");
      await r.git(["stash", "push", "--message", "my wip"]);
    });
    ui.stdin.write("z");
    await waitForFrame(ui, "my wip");
    await waitForFrame(ui, "-line 1");
    ui.stdin.write("d");
    await waitForFrame(ui, "Drop stash@{0}?");
    ui.stdin.write("\r");
    await waitUntil(
      async () => (await repo.git(["stash", "list"]).catch(() => "pending")) === "",
      "stash dropped",
    );
    await waitForFrame(ui, "No stashes");
    ui.stdin.write("\u001b");
    await waitForFrame(ui, "Quick actions");
    ui.stdin.write("u");
    await waitForFrame(ui, 'Dropped stash "On main: my wip"');
    ui.stdin.write("\r");
    await waitUntil(async () => (await repo.git(["stash", "list"])).includes("my wip"), "stash restored");
    ui.unmount();
  });

  it("explains when there is no upstream to pull from", async () => {
    const { ui } = await setup();
    ui.stdin.write("y");
    await waitForFrame(ui, "No upstream to pull from");
    ui.unmount();
  });
});
