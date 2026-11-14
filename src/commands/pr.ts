/** `branchit pr [--json]` — pull-request readiness without the TUI. */
import type { ResolvedConfig } from "../config/schema.js";
import type { GitRepository } from "../git/repository.js";
import { gatherPrReadiness } from "../workflows/pr.js";
import type { CommandIO } from "./io.js";
import { writeJson } from "./io.js";

export async function runPrCommand(
  git: GitRepository,
  config: ResolvedConfig,
  opts: { json: boolean },
  io: CommandIO,
): Promise<number> {
  const [state, branches] = await Promise.all([git.getState(), git.listBranches()]);
  const base = config.branches.defaultBase ?? state.defaultBranch;
  if (!base || !state.currentBranch) {
    io.err(
      !base
        ? "Could not determine a base branch.\n"
        : "HEAD is detached; switch to a branch first.\n",
    );
    return 1;
  }
  const current = branches.find((b) => b.kind === "local" && b.isCurrent);
  const ctx = await gatherPrReadiness(git.client, state, current?.upstream ?? null, base);
  const ready = ctx.readiness.items.every((i) => i.ok);
  if (opts.json) {
    writeJson(io, {
      ...ctx.readiness,
      ready,
      compareUrl: ctx.compareUrl,
      pushRemote: ctx.pushRemote,
    });
    return 0;
  }
  const lines = [`${ctx.readiness.head} → ${ctx.readiness.base}`, ""];
  for (const item of ctx.readiness.items) lines.push(`  ${item.ok ? "✓" : "✗"} ${item.label}`);
  if (ctx.compareUrl) lines.push("", `Compare: ${ctx.compareUrl}`);
  io.out(`${lines.join("\n")}\n`);
  return 0;
}
