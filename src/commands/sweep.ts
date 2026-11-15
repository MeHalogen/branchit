/**
 * `branchit sweep [--dry-run|--yes] [--json]` — the stale-branch sweep without
 * the TUI. Dry-run is the default: it lists candidates and ends with a
 * shareable one-line report card. `--yes` deletes only branches proven merged
 * (`git branch -d`), and prints the exact command to restore each one.
 */
import type { ResolvedConfig } from "../config/schema.js";
import { bulkDeleteBranches, type DeleteOutcome } from "../git/actions.js";
import type { GitRepository } from "../git/repository.js";
import { relativeTime, sanitizeForDisplay } from "../utils/format.js";
import {
  gatherSweepCandidates,
  resolveSweepConfig,
  type SweepCandidate,
  sweepReportCard,
  sweepSummary,
  sweepToJson,
} from "../workflows/sweep.js";
import type { CommandIO } from "./io.js";
import { writeJson } from "./io.js";

export interface SweepOptions {
  yes: boolean;
  json: boolean;
}

function line(c: SweepCandidate, width: number, now: Date): string {
  const age = c.branch.lastCommit ? relativeTime(c.branch.lastCommit.committedAt, now) : "";
  const name = sanitizeForDisplay(c.branch.name).padEnd(width);
  return `  ${name}  ${age.padStart(4)}  ${c.reasons.join(" · ")}`;
}

export async function runSweepCommand(
  git: GitRepository,
  config: ResolvedConfig,
  opts: SweepOptions,
  io: CommandIO,
): Promise<number> {
  const [state, branches] = await Promise.all([git.getState(), git.listBranches()]);
  const sweepConfig = resolveSweepConfig(config.branches, state.defaultBranch, state.currentBranch);
  if (!sweepConfig) {
    io.err("Could not determine a base branch. Set [branches] default_base in .branchit.toml.\n");
    return 1;
  }
  const now = new Date();
  const candidates = await gatherSweepCandidates(git.client, branches, sweepConfig);
  const { safe, review, protected: prot } = sweepSummary(candidates);

  let deleted: DeleteOutcome[] = [];
  if (opts.yes && safe.length > 0) {
    deleted = await bulkDeleteBranches(
      git.client,
      safe.map((c) => ({
        name: c.branch.name,
        mode: "safe" as const,
        restoreSha: c.branch.lastCommit?.sha ?? null,
      })),
    );
  }
  const failed = deleted.filter((d) => !d.ok);

  if (opts.json) {
    writeJson(io, {
      ...sweepToJson(sweepConfig.base, candidates, now),
      ...(opts.yes
        ? {
            deleted: deleted.map((d) => ({
              name: d.name,
              ok: d.ok,
              restoreSha: d.restoreSha,
              error: d.error?.message ?? null,
            })),
          }
        : {}),
    });
    return failed.length > 0 ? 1 : 0;
  }

  const width = Math.min(
    40,
    Math.max(8, ...candidates.map((c) => sanitizeForDisplay(c.branch.name).length)),
  );
  const out: string[] = [`Sweep against ${sweepConfig.base}`, ""];
  out.push(`Safely merged (${safe.length})`);
  out.push(...(safe.length ? safe.map((c) => line(c, width, now)) : ["  none"]));
  out.push("", `Needs review (${review.length}) — never deleted automatically`);
  out.push(...(review.length ? review.map((c) => line(c, width, now)) : ["  none"]));
  if (prot.length) {
    out.push("", `Protected: ${prot.map((c) => sanitizeForDisplay(c.branch.name)).join(", ")}`);
  }
  out.push("");

  if (opts.yes) {
    for (const d of deleted) {
      if (d.ok) {
        out.push(
          `Deleted ${d.name}${d.restoreSha ? `   (restore: git branch ${d.name} ${d.restoreSha})` : ""}`,
        );
      } else {
        out.push(`Could not delete ${d.name}: ${d.error?.message ?? "unknown error"}`);
      }
    }
    if (deleted.length === 0) out.push("Nothing safely merged to delete.");
    out.push("");
  }

  out.push(sweepReportCard(candidates, now));
  if (!opts.yes && safe.length > 0) {
    out.push(
      "",
      `Run \`branchit sweep --yes\` to delete the ${safe.length} safely merged branch${safe.length === 1 ? "" : "es"}.`,
    );
  }
  io.out(`${out.join("\n")}\n`);
  return failed.length > 0 ? 1 : 0;
}
