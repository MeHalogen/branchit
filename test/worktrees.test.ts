import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shellInitScript } from "../src/commands/shell-init.js";
import { ConfigFileSchema, defaultConfig, mergeConfig } from "../src/config/schema.js";
import { parseWorktreeList } from "../src/git/parsers.js";
import { toGitPath, worktreePathFor } from "../src/workflows/worktrees.js";

describe("worktreePathFor", () => {
  it("expands {repo} and {branch} relative to the repository root", () => {
    expect(worktreePathFor("../{repo}-wt/{branch}", "/home/me/code/api", "feat/login")).toBe(
      toGitPath(resolve("/home/me/code/api-wt/feat-login")),
    );
  });
  it("keeps absolute templates and strips unsafe branch characters", () => {
    expect(worktreePathFor("/tmp/wt/{repo}/{branch}", "/x/api", "fix/../../evil")).toBe(
      toGitPath(resolve("/tmp/wt/api/fix-evil")),
    );
  });
});

describe("parseWorktreeList extras", () => {
  it("captures locked and prunable markers", () => {
    const out = [
      "worktree /repo",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /gone",
      "HEAD bbb",
      "branch refs/heads/old",
      "prunable gitdir file points to non-existent location",
      "",
      "worktree /held",
      "HEAD ccc",
      "detached",
      "locked on a USB drive",
      "",
    ].join("\n");
    const [main, gone, held] = parseWorktreeList(out);
    expect(main).toMatchObject({ locked: false, prunable: false });
    expect(gone).toMatchObject({ prunable: true, branchRef: "refs/heads/old" });
    expect(held).toMatchObject({ locked: true, detached: true });
  });
});

describe("[worktrees] config", () => {
  it("accepts a root template", () => {
    expect(defaultConfig().worktrees.root).toBe("../{repo}-wt/{branch}");
    const file = ConfigFileSchema.parse({ worktrees: { root: "../wt/{branch}" } });
    expect(mergeConfig(defaultConfig(), file).worktrees.root).toBe("../wt/{branch}");
  });
});

describe("shell-init", () => {
  it.each(["zsh", "bash"] as const)(
    "defines a %s wrapper that cds via BRANCHIT_CD_FILE",
    (shell) => {
      const s = shellInitScript(shell)!;
      expect(s).toContain("BRANCHIT_CD_FILE");
      expect(s).toContain("command branchit");
      expect(s).toMatch(/cd -- "\$/);
    },
  );
  it("defines a fish function", () => {
    const s = shellInitScript("fish")!;
    expect(s).toContain("function branchit");
    expect(s).toContain("BRANCHIT_CD_FILE");
  });
});
