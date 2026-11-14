/**
 * Large-repository benchmark: 2,000 local branches (1,800 merged, 200 with
 * unique commits). `npm run bench` runs it alone against the 1 s budget; in
 * the normal (parallel) suite it is a loose regression guard so it never flakes.
 */

import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/schema.js";
import { detectRepository, GitRepository } from "../src/git/repository.js";
import {
  gatherSweepCandidates,
  resolveSweepConfig,
  sweepReportCard,
} from "../src/workflows/sweep.js";
import { createRepo, type TempRepo } from "./fixtures/gitRepo.js";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.cleanup()));
});

const BUDGET_MS = process.env["BRANCHIT_BENCH"] ? 1000 : 10_000;

describe("large repository performance", () => {
  it("lists and sweeps 2,000 branches within budget", async () => {
    const repo = await createRepo({ initialBranch: "main" });
    repos.push(repo);
    const main = (await repo.git(["rev-parse", "HEAD"])).trim();

    const merged = Array.from({ length: 1800 }, (_, i) => `create refs/heads/merged/b${i} ${main}`);
    await execa("git", ["update-ref", "--stdin"], {
      cwd: repo.dir,
      input: `${merged.join("\n")}\n`,
    });

    const now = Math.floor(Date.now() / 1000);
    let stream = "";
    for (let i = 0; i < 200; i++) {
      const content = `unique ${i}\n`;
      stream += `commit refs/heads/exp/u${i}\ncommitter Bench <b@x> ${now} +0000\ndata 7\nexp ${String(i).padStart(3, "0")}\nfrom ${main}\nM 100644 inline u${i}.txt\ndata ${Buffer.byteLength(content)}\n${content}\n`;
    }
    await execa("git", ["fast-import", "--quiet"], { cwd: repo.dir, input: stream });

    const detect = await detectRepository(repo.dir);
    const git = new GitRepository({
      root: detect.root!,
      gitDir: detect.gitDir!,
      cwd: repo.dir,
      isBare: false,
    });

    const t0 = performance.now();
    const branches = await git.listBranches();
    const listMs = performance.now() - t0;
    expect(branches.filter((b) => b.kind === "local")).toHaveLength(2001);

    const cfg = resolveSweepConfig(defaultConfig().branches, "main", "main")!;
    const t1 = performance.now();
    const candidates = await gatherSweepCandidates(git.client, branches, cfg);
    const sweepMs = performance.now() - t1;

    expect(candidates.filter((c) => c.classification === "safe_merged")).toHaveLength(1800);
    expect(candidates.filter((c) => c.classification === "unmerged")).toHaveLength(200);
    process.stdout.write(
      `[perf] listBranches ${listMs.toFixed(0)}ms, sweep scan ${sweepMs.toFixed(0)}ms — ${sweepReportCard(candidates)}\n`,
    );
    expect(sweepMs).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
