import { describe, expect, it } from "vitest";
import { hunkPatch, parseDiff } from "../src/git/diff.js";
import { parseStashList } from "../src/git/stash.js";
import { rankBranches } from "../src/search/rank.js";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,3 @@ export function a() {",
  " one",
  "-two",
  "+TWO",
  " three",
  "@@ -10,2 +10,3 @@",
  " ten",
  "+ten-and-a-half",
  " eleven",
  "",
].join("\n");

describe("parseDiff", () => {
  it("splits a file diff into header and hunks with typed lines", () => {
    const [file] = parseDiff(DIFF);
    expect(file?.path).toBe("src/a.ts");
    expect(file?.header).toHaveLength(4);
    expect(file?.hunks).toHaveLength(2);
    expect(file?.hunks[0]?.header).toBe("@@ -1,3 +1,3 @@ export function a() {");
    expect(file?.hunks[0]?.lines.map((l) => l.kind)).toEqual(["context", "del", "add", "context"]);
    expect(file?.hunks[1]?.lines[1]).toEqual({ kind: "add", text: "ten-and-a-half" });
  });

  it("handles multiple files and binary notices", () => {
    const two = `${DIFF}diff --git a/img.png b/img.png\nindex 1..2 100644\nBinary files a/img.png and b/img.png differ\n`;
    const files = parseDiff(two);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "img.png"]);
    expect(files[1]?.binary).toBe(true);
    expect(files[1]?.hunks).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

describe("hunkPatch", () => {
  it("builds an applyable patch containing only the chosen hunk", () => {
    const [file] = parseDiff(DIFF);
    const patch = hunkPatch(file!, 1);
    expect(patch).toBe(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1111111..2222222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -10,2 +10,3 @@",
        " ten",
        "+ten-and-a-half",
        " eleven",
        "",
      ].join("\n"),
    );
  });

  it("keeps the no-newline marker attached to its hunk", () => {
    const d = `diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n`;
    const [file] = parseDiff(d);
    expect(hunkPatch(file!, 0)).toBe(d);
  });
});

describe("parseStashList", () => {
  it("parses index, sha, time and message", () => {
    const out =
      "stash@{0}\x1fabc\x1f2026-01-02T00:00:00+00:00\x1fOn main: wip\nstash@{1}\x1fdef\x1f2026-01-01T00:00:00+00:00\x1fWIP on dev: 123 x\n";
    expect(parseStashList(out)).toEqual([
      {
        ref: "stash@{0}",
        index: 0,
        sha: "abc",
        at: "2026-01-02T00:00:00+00:00",
        message: "On main: wip",
      },
      {
        ref: "stash@{1}",
        index: 1,
        sha: "def",
        at: "2026-01-01T00:00:00+00:00",
        message: "WIP on dev: 123 x",
      },
    ]);
  });
});

describe("rankBranches boost", () => {
  it("lets a boosted kind win ties within a tier but never across tiers", () => {
    const items = [
      { name: "sweep.ts", boost: 0 },
      { name: "sweep", boost: 20 },
      { name: "src/sweeper", boost: 50 },
    ];
    const ranked = rankBranches(items, "sweep").map((r) => r.item.name);
    expect(ranked[0]).toBe("sweep"); // exact beats prefix regardless of boost
    expect(ranked[1]).toBe("sweep.ts"); // prefix beats token even with lower boost
  });
});
