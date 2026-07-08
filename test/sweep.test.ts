import { describe, it, expect } from "vitest";
import {
  classifyBranch,
  isProtectedName,
  type BranchMergeInfo,
  type SweepConfig,
} from "../src/workflows/sweep.js";
import type { Branch } from "../src/git/models.js";

function branch(partial: Partial<Branch> & { name: string }): Branch {
  return {
    id: `refs/heads/${partial.name}`,
    fullRef: `refs/heads/${partial.name}`,
    kind: "local",
    isCurrent: false,
    upstream: null,
    lastCommit: {
      sha: "deadbeef",
      shortSha: "deadbee",
      subject: "x",
      authorName: "A",
      committedAt: "2024-01-01T00:00:00Z",
    },
    worktreePath: null,
    ...partial,
  };
}

const config: SweepConfig = {
  base: "origin/main",
  protectedPatterns: ["main", "master", "develop", "release/*"],
  currentBranch: "main",
};

const info = (o: Partial<BranchMergeInfo>): BranchMergeInfo => ({
  merged: false,
  uniqueCommitCount: 0,
  patchEquivalent: false,
  ...o,
});

describe("isProtectedName", () => {
  it("matches exact names and prefix globs", () => {
    expect(isProtectedName("main", config.protectedPatterns)).toBe(true);
    expect(isProtectedName("release/1.2", config.protectedPatterns)).toBe(true);
    expect(isProtectedName("feat/x", config.protectedPatterns)).toBe(false);
  });
});

describe("classifyBranch", () => {
  it("classifies a merged branch as safe and preselects it", () => {
    const c = classifyBranch(branch({ name: "feat/done" }), info({ merged: true }), config);
    expect(c.classification).toBe("safe_merged");
    expect(c.confidence).toBe("certain");
    expect(c.deletionMode).toBe("safe");
    expect(c.selected).toBe(true);
  });

  it("never preselects or safe-deletes an unmerged branch", () => {
    const c = classifyBranch(
      branch({ name: "experiment/cache" }),
      info({ merged: false, uniqueCommitCount: 3 }),
      config,
    );
    expect(c.classification).toBe("unmerged");
    expect(c.deletionMode).toBe("force");
    expect(c.selected).toBe(false);
  });

  it("labels patch-equivalent non-ancestors as squash-suspected (likely)", () => {
    const c = classifyBranch(
      branch({ name: "feat/squashed", upstream: { ref: "origin/feat/squashed", remoteName: "origin", ahead: 0, behind: 0, gone: true } }),
      info({ merged: false, uniqueCommitCount: 2, patchEquivalent: true }),
      config,
    );
    expect(c.classification).toBe("squash_suspected");
    expect(c.confidence).toBe("likely");
    expect(c.selected).toBe(false);
    expect(c.deletionMode).toBe("force");
  });

  it("classifies remote-gone unmerged branches as needs-review, not safe", () => {
    const c = classifyBranch(
      branch({
        name: "fix/gone",
        upstream: { ref: "origin/fix/gone", remoteName: "origin", ahead: 0, behind: 0, gone: true },
      }),
      info({ merged: false, uniqueCommitCount: 1, patchEquivalent: false }),
      config,
    );
    expect(c.classification).toBe("remote_gone");
    expect(c.selected).toBe(false);
    expect(c.deletionMode).toBe("force");
  });

  it("protects the current branch even if it appears merged", () => {
    const c = classifyBranch(branch({ name: "main", isCurrent: true }), info({ merged: true }), config);
    expect(c.classification).toBe("protected");
    expect(c.deletionMode).toBe("none");
    expect(c.selected).toBe(false);
  });

  it("protects branches checked out in another worktree", () => {
    const c = classifyBranch(
      branch({ name: "feat/wt", worktreePath: "/somewhere/else" }),
      info({ merged: true }),
      config,
    );
    expect(c.classification).toBe("protected");
    expect(c.deletionMode).toBe("none");
  });

  it("protects configured branches", () => {
    const c = classifyBranch(branch({ name: "develop" }), info({ merged: true }), config);
    expect(c.classification).toBe("protected");
  });
});
