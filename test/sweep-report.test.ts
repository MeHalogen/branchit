import { describe, expect, it } from "vitest";
import type { Branch } from "../src/git/models.js";
import { humanAge } from "../src/utils/format.js";
import {
  classifyBranch,
  resolveSweepConfig,
  type SweepConfig,
  sweepReportCard,
  sweepToJson,
} from "../src/workflows/sweep.js";

const now = new Date("2026-06-01T00:00:00Z");

function branch(name: string, committedAt: string, extra: Partial<Branch> = {}): Branch {
  return {
    id: `refs/heads/${name}`,
    fullRef: `refs/heads/${name}`,
    name,
    kind: "local",
    isCurrent: false,
    upstream: null,
    lastCommit: {
      sha: `${name}-sha`,
      shortSha: "abc1234",
      subject: "x",
      authorName: "A",
      committedAt,
    },
    worktreePath: null,
    ...extra,
  };
}

const cfg: SweepConfig = { base: "main", protectedPatterns: ["main"], currentBranch: "main" };
const none = { merged: false, uniqueCommitCount: 0, patchEquivalent: false };

function candidates() {
  return [
    classifyBranch(branch("main", "2026-05-31T00:00:00Z", { isCurrent: true }), none, cfg),
    classifyBranch(branch("feat/a", "2026-05-20T00:00:00Z"), { ...none, merged: true }, cfg),
    classifyBranch(branch("feat/b", "2025-03-15T00:00:00Z"), { ...none, merged: true }, cfg),
    classifyBranch(
      branch("feat/sq", "2026-01-01T00:00:00Z"),
      { ...none, uniqueCommitCount: 2, patchEquivalent: true },
      cfg,
    ),
    classifyBranch(
      branch("fix/gone", "2026-02-01T00:00:00Z", {
        upstream: { ref: "origin/fix/gone", remoteName: "origin", ahead: 0, behind: 0, gone: true },
      }),
      { ...none, uniqueCommitCount: 1 },
      cfg,
    ),
    classifyBranch(branch("exp/x", "2026-05-01T00:00:00Z"), { ...none, uniqueCommitCount: 3 }, cfg),
  ];
}

describe("humanAge", () => {
  it("scales from days to years", () => {
    expect(humanAge("2026-05-31T00:00:00Z", now)).toBe("1 day");
    expect(humanAge("2026-05-26T00:00:00Z", now)).toBe("6 days");
    expect(humanAge("2026-05-04T00:00:00Z", now)).toBe("4 weeks");
    expect(humanAge("2025-03-15T00:00:00Z", now)).toBe("14 months");
    expect(humanAge("2023-06-01T00:00:00Z", now)).toBe("3 years");
    expect(humanAge("2026-06-01T00:00:00Z", now)).toBe("today");
  });
});

describe("sweepReportCard", () => {
  it("summarizes counts and the oldest sweepable branch on one line", () => {
    expect(sweepReportCard(candidates(), now)).toBe(
      "6 branches · 2 safely merged · 1 likely squash-merged · 1 upstream gone · 1 unmerged · oldest 14 months",
    );
  });
  it("omits zero categories and handles a tidy repo", () => {
    expect(sweepReportCard(candidates().slice(0, 1), now)).toBe("1 branch · nothing to sweep");
  });
});

describe("sweepToJson", () => {
  it("emits a stable machine-readable shape", () => {
    const json = sweepToJson("main", candidates(), now);
    expect(json.base).toBe("main");
    expect(json.summary).toEqual({
      total: 6,
      safeMerged: 2,
      squashSuspected: 1,
      remoteGone: 1,
      unmerged: 1,
      protected: 1,
      oldestDays: 443,
    });
    expect(json.branches[1]).toEqual({
      name: "feat/a",
      classification: "safe_merged",
      confidence: "certain",
      reasons: ["tip reachable from main"],
      uniqueCommitCount: 0,
      lastCommitAt: "2026-05-20T00:00:00Z",
      sha: "feat/a-sha",
    });
  });
});

describe("resolveSweepConfig", () => {
  it("prefers configured base and always protects its leaf name", () => {
    expect(
      resolveSweepConfig({ defaultBase: "origin/main", protected: ["release/*"] }, "main", "dev"),
    ).toEqual({
      base: "origin/main",
      protectedPatterns: ["release/*", "main"],
      currentBranch: "dev",
    });
  });
  it("returns null when no base can be determined", () => {
    expect(resolveSweepConfig({ defaultBase: null, protected: [] }, null, "dev")).toBeNull();
  });
});
