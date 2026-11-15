import { describe, expect, it } from "vitest";
import { type FileChange, makeWorkingTree } from "../src/git/models.js";
import {
  buildCommitMessage,
  inferScope,
  stageableFiles,
  suggestType,
  validateSubject,
} from "../src/workflows/commit.js";

const fc = (path: string, kind: FileChange["kind"] = "modified"): FileChange => ({
  path,
  kind,
  xy: "M.",
});

describe("buildCommitMessage", () => {
  it("builds a header with type, scope and subject", () => {
    expect(
      buildCommitMessage({
        type: "fix",
        scope: "auth",
        breaking: false,
        subject: "refresh tokens",
        body: "",
      }),
    ).toBe("fix(auth): refresh tokens\n");
  });
  it("omits the scope parens when scope is empty", () => {
    expect(
      buildCommitMessage({ type: "chore", scope: "", breaking: false, subject: "tidy", body: "" }),
    ).toBe("chore: tidy\n");
  });
  it("adds a breaking marker and a BREAKING CHANGE footer", () => {
    const msg = buildCommitMessage({
      type: "feat",
      scope: "api",
      breaking: true,
      subject: "replace auth endpoint",
      body: "details here",
    });
    expect(msg).toContain("feat(api)!: replace auth endpoint");
    expect(msg).toContain("details here");
    expect(msg).toContain("BREAKING CHANGE: replace auth endpoint");
  });
});

describe("validateSubject", () => {
  it("requires a non-empty subject", () => {
    expect(validateSubject("").ok).toBe(false);
  });
  it("warns (non-blocking) on length and trailing period", () => {
    const long = `${"x".repeat(80)}.`;
    const v = validateSubject(long);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("chars"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("period"))).toBe(true);
  });
});

describe("inferScope", () => {
  it("picks the most common meaningful directory, descending past src/", () => {
    expect(
      inferScope([fc("src/auth/token.ts"), fc("src/auth/session.ts"), fc("src/api/x.ts")]),
    ).toBe("auth");
  });
  it("returns null for top-level files only", () => {
    expect(inferScope([fc("README.md"), fc("index.ts")])).toBeNull();
  });
});

describe("suggestType", () => {
  it("suggests docs for markdown-only changes", () => {
    expect(suggestType([fc("README.md"), fc("docs/guide.md")])).toBe("docs");
  });
  it("suggests test for test-only changes", () => {
    expect(suggestType([fc("test/auth.test.ts"), fc("src/auth.spec.ts")])).toBe("test");
  });
  it("suggests build when a dependency manifest changes", () => {
    expect(suggestType([fc("package.json")])).toBe("build");
  });
  it("returns null when unsure", () => {
    expect(suggestType([fc("src/a.ts"), fc("src/b.ts")])).toBeNull();
  });
});

describe("stageableFiles", () => {
  it("dedupes a path that is both staged and modified, marking it staged", () => {
    const wt = makeWorkingTree({
      staged: [fc("src/a.ts")],
      unstaged: [fc("src/a.ts"), fc("src/b.ts")],
      untracked: [fc("new.ts", "untracked")],
      conflicted: [],
    });
    const files = stageableFiles(wt);
    const a = files.find((f) => f.path === "src/a.ts")!;
    expect(a.staged).toBe(true);
    expect(files.find((f) => f.path === "src/b.ts")!.staged).toBe(false);
    expect(files.find((f) => f.path === "new.ts")!.status).toBe("untracked");
    expect(files).toHaveLength(3);
  });
});
