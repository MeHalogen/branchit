import { describe, expect, it } from "vitest";
import {
  parseForEachRefBranches,
  parseRemotes,
  parseStatusPorcelainV2,
  parseWorktreeList,
} from "../src/git/parsers.js";

const U = "\x1f";
const R = "\x1e";

describe("parseStatusPorcelainV2", () => {
  it("parses branch headers, staged, modified and untracked", () => {
    const out = `${[
      "# branch.oid abc123",
      "# branch.head feat/x",
      "# branch.upstream origin/feat/x",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 aaa bbb src/staged.ts",
      "1 .M N... 100644 100644 100644 aaa bbb src/modified.ts",
      "? untracked.log",
    ].join("\0")}\0`;
    const parsed = parseStatusPorcelainV2(out);
    expect(parsed.branch.head).toBe("feat/x");
    expect(parsed.branch.upstream).toBe("origin/feat/x");
    expect(parsed.branch.ahead).toBe(2);
    expect(parsed.branch.behind).toBe(1);
    expect(parsed.workingTree.staged.map((f) => f.path)).toEqual(["src/staged.ts"]);
    expect(parsed.workingTree.unstaged.map((f) => f.path)).toEqual(["src/modified.ts"]);
    expect(parsed.workingTree.untracked.map((f) => f.path)).toEqual(["untracked.log"]);
    expect(parsed.workingTree.isClean).toBe(false);
  });

  it("detects detached HEAD and a clean tree", () => {
    const out = `${["# branch.oid abc123", "# branch.head (detached)"].join("\0")}\0`;
    const parsed = parseStatusPorcelainV2(out);
    expect(parsed.branch.detached).toBe(true);
    expect(parsed.branch.head).toBeNull();
    expect(parsed.workingTree.isClean).toBe(true);
  });

  it("handles renames whose orig path is a separate NUL field", () => {
    const out = `${[
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts",
      "old name.ts",
    ].join("\0")}\0`;
    const parsed = parseStatusPorcelainV2(out);
    expect(parsed.workingTree.staged).toHaveLength(1);
    expect(parsed.workingTree.staged[0]!.path).toBe("new name.ts");
    expect(parsed.workingTree.staged[0]!.origPath).toBe("old name.ts");
    expect(parsed.workingTree.staged[0]!.kind).toBe("renamed");
  });

  it("classifies unmerged entries as conflicted", () => {
    const out = `${["# branch.head main", "u UU N... 1 1 1 100644 aaa bbb ccc conflicted.ts"].join("\0")}\0`;
    const parsed = parseStatusPorcelainV2(out);
    expect(parsed.workingTree.conflicted.map((f) => f.path)).toEqual(["conflicted.ts"]);
  });
});

describe("parseForEachRefBranches", () => {
  const record = (fields: string[]) => fields.join(U) + R;

  it("parses local and remote branches with upstream tracking", () => {
    const out =
      record([
        "refs/heads/main",
        "main",
        "*",
        "fullsha1",
        "short1",
        "refs/remotes/origin/main",
        "origin/main",
        "ahead 2, behind 1",
        "fix things",
        "Alice",
        "2024-01-01T00:00:00+00:00",
        "",
      ]) +
      record([
        "refs/remotes/origin/feat/y",
        "origin/feat/y",
        " ",
        "fullsha2",
        "short2",
        "",
        "",
        "",
        "add y",
        "Bob",
        "2024-01-02T00:00:00+00:00",
        "",
      ]);
    const branches = parseForEachRefBranches(out);
    expect(branches).toHaveLength(2);
    const main = branches.find((b) => b.name === "main")!;
    expect(main.kind).toBe("local");
    expect(main.isCurrent).toBe(true);
    expect(main.upstream).toEqual({
      ref: "origin/main",
      remoteName: "origin",
      ahead: 2,
      behind: 1,
      gone: false,
    });
    const remote = branches.find((b) => b.name === "origin/feat/y")!;
    expect(remote.kind).toBe("remote");
    expect(remote.upstream).toBeNull();
  });

  it("marks gone upstreams and skips origin/HEAD", () => {
    const out =
      record([
        "refs/heads/feat/gone",
        "feat/gone",
        " ",
        "sha",
        "sh",
        "refs/remotes/origin/feat/gone",
        "origin/feat/gone",
        "gone",
        "s",
        "A",
        "2024-01-01T00:00:00+00:00",
        "",
      ]) +
      record([
        "refs/remotes/origin/HEAD",
        "origin/HEAD",
        " ",
        "sha",
        "sh",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    const branches = parseForEachRefBranches(out);
    expect(branches.map((b) => b.name)).toEqual(["feat/gone"]);
    expect(branches[0]!.upstream!.gone).toBe(true);
  });
});

describe("parseRemotes", () => {
  it("groups fetch/push and detects GitHub host", () => {
    const out = [
      "origin\tgit@github.com:acme/payments.git (fetch)",
      "origin\tgit@github.com:acme/payments.git (push)",
      "upstream\thttps://gitlab.com/acme/payments.git (fetch)",
      "upstream\thttps://gitlab.com/acme/payments.git (push)",
    ].join("\n");
    const remotes = parseRemotes(out);
    expect(remotes).toHaveLength(2);
    const origin = remotes.find((r) => r.name === "origin")!;
    expect(origin.hostKind).toBe("github");
    expect(origin.fetchUrl).toBe("git@github.com:acme/payments.git");
    expect(remotes.find((r) => r.name === "upstream")!.hostKind).toBe("gitlab");
  });
});

describe("parseWorktreeList", () => {
  it("parses multiple worktrees with branches", () => {
    const out = [
      "worktree /repo",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /repo-hotfix",
      "HEAD bbb",
      "branch refs/heads/hotfix",
      "",
    ].join("\n");
    const wts = parseWorktreeList(out);
    expect(wts).toHaveLength(2);
    expect(wts[1]!.path).toBe("/repo-hotfix");
    expect(wts[1]!.branchRef).toBe("refs/heads/hotfix");
  });
});
