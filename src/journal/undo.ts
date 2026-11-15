/**
 * Universal undo: plan the inverse of a journaled operation (pure), then
 * execute it. Every plan is validated against the repository as it is now, so
 * an undo never clobbers work done after the original operation. Pushes are
 * never undoable: rewriting shared history is not something to do silently.
 */
import { type GitCommand, journalQuery, mutation } from "../git/command.js";
import type { GitRepository } from "../git/repository.js";
import { relativeTime } from "../utils/format.js";
import type { Journal, JournalEntry } from "./journal.js";

export interface UndoContext {
  currentBranch: string | null;
  headSha: string | null;
  branchTips: Map<string, string>;
  /** Stash commit SHAs, index 0 = stash@{0}. */
  stashShas: string[];
}

export type UndoPlan =
  | { ok: true; summary: string; commands: GitCommand[]; warnings: string[] }
  | { ok: false; summary: string; reason: string };

/** One-line human description of a journaled operation. */
export function describeEntry(e: JournalEntry): string {
  switch (e.op) {
    case "switch":
      return `Switched from ${e.from ?? `detached ${e.fromSha.slice(0, 7)}`} to ${e.to}`;
    case "create-branch":
      return e.switched ? `Created and switched to ${e.name}` : `Created branch ${e.name}`;
    case "delete-branches":
      return `Deleted ${e.branches.length === 1 ? "branch" : `${e.branches.length} branches`} ${e.branches.map((b) => b.name).join(", ")}`;
    case "commit":
      return `Committed "${e.subject}"${e.branch ? ` on ${e.branch}` : ""}`;
    case "stash-switch":
      return `Stashed changes and switched from ${e.from ?? "detached HEAD"} to ${e.to}`;
    case "push":
      return `Pushed ${e.branch} to ${e.remote}`;
    case "undo":
      return "Undo";
  }
}

function switchBack(from: string | null, fromSha: string): GitCommand {
  return from ? mutation.switchBranch(from) : mutation.switchDetach(fromSha);
}

function here(ctx: UndoContext): string {
  return ctx.currentBranch ?? "a detached HEAD";
}

export function planUndo(e: JournalEntry, ctx: UndoContext): UndoPlan {
  const summary = describeEntry(e);
  const no = (reason: string): UndoPlan => ({ ok: false, summary, reason });
  const yes = (commands: GitCommand[], warnings: string[] = []): UndoPlan => ({
    ok: true,
    summary,
    commands,
    warnings,
  });

  switch (e.op) {
    case "switch":
      if (ctx.currentBranch !== e.to) {
        return no(
          `You are now on ${here(ctx)}, not ${e.to}; switch manually if you want to go back.`,
        );
      }
      return yes([switchBack(e.from, e.fromSha)]);

    case "create-branch": {
      const tip = ctx.branchTips.get(e.name);
      if (tip === undefined) return no(`${e.name} no longer exists.`);
      if (tip !== e.sha)
        return no(
          `${e.name} has new commits since it was created; delete it manually if you mean to.`,
        );
      const cmds: GitCommand[] = [];
      if (ctx.currentBranch === e.name) {
        if (!e.from)
          return no(`${e.name} is checked out and there is no previous branch to return to.`);
        cmds.push(mutation.switchBranch(e.from));
      }
      cmds.push(mutation.safeDeleteBranch(e.name));
      return yes(cmds);
    }

    case "delete-branches": {
      const cmds: GitCommand[] = [];
      const warnings: string[] = [];
      for (const b of e.branches) {
        if (ctx.branchTips.has(b.name))
          warnings.push(`${b.name} already exists again; left as is.`);
        else cmds.push(mutation.recreateBranch(b.name, b.sha));
      }
      if (cmds.length === 0) return no("Every deleted branch has been recreated already.");
      return yes(cmds, warnings);
    }

    case "commit":
      if (ctx.headSha !== e.after) {
        return no("HEAD has moved since that commit (new commits, a switch, or a rebase).");
      }
      if (!e.before)
        return no("That was the first commit in the repository; there is no parent to return to.");
      return yes(
        [mutation.resetSoft(e.before)],
        ["The commit's changes stay staged, so nothing is lost."],
      );

    case "stash-switch": {
      const index = ctx.stashShas.indexOf(e.stashSha);
      if (index === -1) return no("That stash is gone (already popped or dropped).");
      if (ctx.currentBranch !== e.to) {
        return no(
          `You are now on ${here(ctx)}, not ${e.to}. Restore the stash manually with git stash pop.`,
        );
      }
      const back = e.from ? mutation.switchBranch(e.from) : null;
      return yes([...(back ? [back] : []), mutation.stashPop(`stash@{${index}}`)]);
    }

    case "push":
      return no(
        "Pushes cannot be undone: others may already have the commits. To reverse the changes, use git revert and push again.",
      );

    case "undo":
      return no("Undo records are not themselves undoable.");
  }
}

/** Read the live facts `planUndo` validates against. */
export async function readUndoContext(git: GitRepository): Promise<UndoContext> {
  const [branch, head, tips, stash] = await Promise.all([
    git.client.run({ args: ["branch", "--show-current"], display: "git branch --show-current" }),
    git.client.run(journalQuery.headSha()),
    git.client.run(journalQuery.branchTips()),
    git.client.run(journalQuery.stashShas()),
  ]);
  const branchTips = new Map<string, string>();
  if (tips.ok) {
    for (const line of tips.stdout.split("\n")) {
      const [name, sha] = line.split("\0");
      if (name && sha) branchTips.set(name, sha);
    }
  }
  return {
    currentBranch: branch.ok && branch.stdout.trim() ? branch.stdout.trim() : null,
    headSha: head.ok ? head.stdout.trim() || null : null,
    branchTips,
    stashShas: stash.ok ? stash.stdout.split("\n").filter(Boolean) : [],
  };
}

export interface UndoResult {
  ok: boolean;
  /** Commands that ran successfully, in order. */
  ran: string[];
  /** The command that failed and why, when `ok` is false. */
  failed?: { command: string; message: string };
}

/**
 * Run an `ok` plan step by step, stopping at the first failure. Only a fully
 * successful undo is recorded, so a partial one can be retried or finished by
 * hand from the reported state.
 */
export async function executeUndo(
  git: GitRepository,
  journal: Journal,
  entry: JournalEntry,
  plan: Extract<UndoPlan, { ok: true }>,
): Promise<UndoResult> {
  const ran: string[] = [];
  for (const command of plan.commands) {
    const res = await git.client.run(command);
    if (!res.ok) {
      return {
        ok: false,
        ran,
        failed: { command: command.display, message: res.error?.message ?? res.stderr.trim() },
      };
    }
    ran.push(command.display);
  }
  journal.append({ op: "undo", of: entry.id });
  return { ok: true, ran };
}

/** "Committed "feat: x" on main · 4m ago" */
export function entryLine(e: JournalEntry, now = new Date()): string {
  const ago = relativeTime(e.at, now);
  const when = !ago ? "" : ago.endsWith("s") ? "just now" : `${ago} ago`;
  return `${describeEntry(e)}${when ? ` · ${when}` : ""}`;
}
