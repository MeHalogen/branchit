/**
 * `branchit undo [--yes] [--json] [--list]` — reverse the last operation
 * Branchit performed. Without --yes it previews the exact inverse commands;
 * with --yes it runs them. Pushes and stale operations are refused with a
 * reason rather than attempted.
 */
import type { GitRepository } from "../git/repository.js";
import { Journal } from "../journal/journal.js";
import { entryLine, executeUndo, planUndo, readUndoContext } from "../journal/undo.js";
import { sanitizeForDisplay } from "../utils/format.js";
import type { CommandIO } from "./io.js";
import { writeJson } from "./io.js";

export interface UndoOptions {
  yes: boolean;
  json: boolean;
  list: boolean;
}

export async function runUndoCommand(
  git: GitRepository,
  opts: UndoOptions,
  io: CommandIO,
): Promise<number> {
  const journal = Journal.forGitDir(git.gitDir);
  const history = journal.history();

  if (opts.list) {
    if (opts.json) writeJson(io, history);
    else if (history.length === 0) io.out("No recorded operations.\n");
    else io.out(`${history.map((e) => sanitizeForDisplay(entryLine(e))).join("\n")}\n`);
    return 0;
  }

  const entry = history[0] ?? null;
  if (!entry) {
    if (opts.json) writeJson(io, { undoable: false, entry: null, reason: "Nothing to undo." });
    else
      io.err(
        journal.read().length > 0
          ? "Nothing left to undo: every recorded operation has been undone.\n"
          : "Nothing to undo: Branchit has not recorded any operations in this repository.\n",
      );
    return 1;
  }

  const plan = planUndo(entry, await readUndoContext(git));
  if (!plan.ok) {
    if (opts.json) writeJson(io, { undoable: false, entry, reason: plan.reason });
    else io.err(`${sanitizeForDisplay(entryLine(entry))}\nCannot undo: ${plan.reason}\n`);
    return 1;
  }

  const commands = plan.commands.map((c) => c.display);
  if (!opts.yes) {
    if (opts.json) {
      writeJson(io, { undoable: true, entry, commands, warnings: plan.warnings, applied: false });
    } else {
      const lines = [
        sanitizeForDisplay(entryLine(entry)),
        "",
        "Undo would run:",
        ...commands.map((c) => `  ${sanitizeForDisplay(c)}`),
        ...plan.warnings.map((w) => `! ${sanitizeForDisplay(w)}`),
        "",
        "Run `branchit undo --yes` to apply.",
      ];
      io.out(`${lines.join("\n")}\n`);
    }
    return 0;
  }

  const res = await executeUndo(git, journal, entry, plan);
  if (opts.json) {
    writeJson(io, {
      undoable: true,
      entry,
      commands,
      applied: res.ok,
      ran: res.ran,
      failed: res.failed ?? null,
    });
  } else if (res.ok) {
    io.out(
      `Undone: ${sanitizeForDisplay(plan.summary)}\n${res.ran.map((c) => `  ${c}`).join("\n")}\n`,
    );
  } else {
    io.err(
      `Undo stopped at \`${res.failed?.command}\`: ${res.failed?.message}\n` +
        (res.ran.length ? `Already ran:\n${res.ran.map((c) => `  ${c}`).join("\n")}\n` : ""),
    );
  }
  return res.ok ? 0 : 1;
}
