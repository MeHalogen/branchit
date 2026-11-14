import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Journal } from "../src/journal/journal.js";
import { planUndo, type UndoContext } from "../src/journal/undo.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function journal() {
  const dir = await mkdtemp(join(tmpdir(), "branchit-journal-"));
  dirs.push(dir);
  return new Journal(join(dir, "branchit", "journal.jsonl"));
}

const ctx = (o: Partial<UndoContext> = {}): UndoContext => ({
  currentBranch: "main",
  headSha: "c2",
  branchTips: new Map([["main", "c2"]]),
  stashShas: [],
  ...o,
});

const at = "2026-01-01T00:00:00.000Z";

describe("Journal", () => {
  it("appends entries with ids and reads them back in order", async () => {
    const j = await journal();
    const a = j.append({ op: "switch", from: "main", fromSha: "c1", to: "dev" });
    const b = j.append({ op: "push", branch: "dev", remote: "origin" });
    expect(a.id).not.toBe(b.id);
    expect(j.read().map((e) => e.op)).toEqual(["switch", "push"]);
  });

  it("returns an empty history when no journal exists", async () => {
    expect((await journal()).read()).toEqual([]);
  });

  it("lastUndoable skips operations that were already undone", async () => {
    const j = await journal();
    const a = j.append({ op: "switch", from: "main", fromSha: "c1", to: "dev" });
    const b = j.append({ op: "switch", from: "dev", fromSha: "c1", to: "qa" });
    j.append({ op: "undo", of: b.id });
    expect(j.lastUndoable()?.id).toBe(a.id);
    j.append({ op: "undo", of: a.id });
    expect(j.lastUndoable()).toBeNull();
  });

  it("ignores corrupt lines instead of failing", async () => {
    const j = await journal();
    j.append({ op: "push", branch: "x", remote: "origin" });
    const { appendFileSync } = await import("node:fs");
    appendFileSync(j.file, "{not json\n");
    expect(j.read()).toHaveLength(1);
  });
});

describe("planUndo", () => {
  it("switch: switches back when still on the target branch", () => {
    const plan = planUndo(
      { id: "1", at, op: "switch", from: "main", fromSha: "c1", to: "dev" },
      ctx({ currentBranch: "dev" }),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual(["git switch -- main"]);
  });

  it("switch: refuses once the user has moved elsewhere", () => {
    const plan = planUndo(
      { id: "1", at, op: "switch", from: "main", fromSha: "c1", to: "dev" },
      ctx({ currentBranch: "qa" }),
    );
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toContain("now on qa");
  });

  it("switch from detached HEAD returns to the same commit", () => {
    const plan = planUndo(
      { id: "1", at, op: "switch", from: null, fromSha: "c1", to: "dev" },
      ctx({ currentBranch: "dev" }),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual(["git switch --detach c1"]);
  });

  it("create-branch: switches back and safely deletes the untouched branch", () => {
    const plan = planUndo(
      { id: "1", at, op: "create-branch", name: "feat/x", sha: "c2", from: "main", switched: true },
      ctx({
        currentBranch: "feat/x",
        branchTips: new Map([
          ["main", "c2"],
          ["feat/x", "c2"],
        ]),
      }),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual([
      "git switch -- main",
      "git branch --delete -- feat/x",
    ]);
  });

  it("create-branch: refuses when the branch has new commits", () => {
    const plan = planUndo(
      { id: "1", at, op: "create-branch", name: "feat/x", sha: "c2", from: "main", switched: true },
      ctx({ currentBranch: "feat/x", branchTips: new Map([["feat/x", "c3"]]) }),
    );
    expect(!plan.ok && plan.reason).toContain("new commits");
  });

  it("delete-branches: recreates every branch that is still missing", () => {
    const plan = planUndo(
      {
        id: "1",
        at,
        op: "delete-branches",
        branches: [
          { name: "a", sha: "s1" },
          { name: "b", sha: "s2" },
        ],
      },
      ctx({ branchTips: new Map([["b", "zz"]]) }),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual(["git branch -- a s1"]);
    expect(plan.ok && plan.warnings[0]).toContain("b already exists");
  });

  it("commit: soft-resets to the parent, keeping changes staged", () => {
    const plan = planUndo(
      { id: "1", at, op: "commit", branch: "main", before: "c1", after: "c2", subject: "feat: x" },
      ctx(),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual(["git reset --soft c1"]);
  });

  it("commit: refuses when HEAD has moved past the commit", () => {
    const plan = planUndo(
      { id: "1", at, op: "commit", branch: "main", before: "c1", after: "c2", subject: "feat: x" },
      ctx({ headSha: "c3" }),
    );
    expect(plan.ok).toBe(false);
  });

  it("stash-switch: switches back and pops the exact stash", () => {
    const plan = planUndo(
      { id: "1", at, op: "stash-switch", from: "main", to: "dev", stashSha: "st", message: "m" },
      ctx({ currentBranch: "dev", stashShas: ["other", "st"] }),
    );
    expect(plan.ok && plan.commands.map((c) => c.display)).toEqual([
      "git switch -- main",
      "git stash pop --index 'stash@{1}'",
    ]);
  });

  it("push: is never undoable, and says why", () => {
    const plan = planUndo({ id: "1", at, op: "push", branch: "dev", remote: "origin" }, ctx());
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toContain("git revert");
  });
});
