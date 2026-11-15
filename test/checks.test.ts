import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type CheckState, detectChecks, runChecks } from "../src/workflows/checks.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function tmp() {
  const d = await mkdtemp(join(tmpdir(), "branchit-checks-"));
  dirs.push(d);
  return d;
}

describe("detectChecks", () => {
  it("returns known scripts present in package.json, in run order", async () => {
    const d = await tmp();
    await writeFile(
      join(d, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", build: "tsup" } }),
    );
    const checks = detectChecks(d);
    expect(checks.map((c) => c.name)).toEqual(["lint", "test"]);
    expect(checks[0]!.argv).toEqual(["npm", "run", "lint"]);
    expect(checks[0]!.display).toBe("npm run lint");
  });

  it("uses pnpm when a pnpm lockfile is present", async () => {
    const d = await tmp();
    await writeFile(join(d, "package.json"), JSON.stringify({ scripts: { lint: "x" } }));
    await writeFile(join(d, "pnpm-lock.yaml"), "");
    expect(detectChecks(d)[0]!.argv).toEqual(["pnpm", "run", "lint"]);
  });

  it("returns nothing when there is no package.json", async () => {
    expect(detectChecks(await tmp())).toEqual([]);
  });
});

describe("runChecks", () => {
  const pass = { name: "ok", display: "node ok", argv: ["node", "-e", "process.exit(0)"] };
  const fail = {
    name: "bad",
    display: "node bad",
    argv: ["node", "-e", "console.error('boom'); process.exit(1)"],
  };

  it("runs all checks and reports pass", async () => {
    const progress: CheckState[][] = [];
    const res = await runChecks(process.cwd(), [pass], (s) => progress.push(s), undefined);
    expect(res.passed).toBe(true);
    expect(res.results[0]!.status).toBe("passed");
    expect(res.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    // Progress was reported (waiting -> running -> passed).
    expect(progress.length).toBeGreaterThanOrEqual(2);
  });

  it("stops on the first failure and captures output", async () => {
    const res = await runChecks(process.cwd(), [fail, pass], () => {}, undefined);
    expect(res.passed).toBe(false);
    expect(res.results[0]!.status).toBe("failed");
    expect(res.results[0]!.output).toContain("boom");
    // The second check never ran.
    expect(res.results[1]!.status).toBe("waiting");
  });

  it("cancels remaining checks when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await runChecks(process.cwd(), [pass], () => {}, controller.signal);
    expect(res.passed).toBe(false);
    expect(res.results[0]!.status).toBe("cancelled");
  });
});
