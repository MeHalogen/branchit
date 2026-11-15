/**
 * The journaling choke point. Every state-changing action the UI or CLI takes
 * goes through a {@link Recorder}, which captures the refs before the action,
 * runs it via the plain actions in `git/actions.ts` / `git/sync.ts`, and
 * appends a journal entry only when the action succeeded. Journal write
 * failures never fail the action itself.
 */
import {
  type ActionResult,
  bulkDeleteBranches,
  type CommitResult,
  commitChanges,
  createBranch,
  type DeleteOutcome,
  type DeleteSpec,
  stashBeforeSwitch,
  switchBranch,
  switchTrackNew,
} from "../git/actions.js";
import { journalQuery, mutation } from "../git/command.js";
import type { GitRepository } from "../git/repository.js";
import type { StashEntry } from "../git/stash.js";
import { stashCommands } from "../git/stash.js";
import { pushCurrent } from "../git/sync.js";
import { type PullMode, workspaceCommands } from "../git/workspace.js";
import type { Journal, JournalEntry, JournalOp } from "./journal.js";

export class Recorder {
  constructor(
    readonly git: GitRepository,
    readonly journal: Journal,
  ) {}

  private record(op: JournalOp): JournalEntry | null {
    try {
      return this.journal.append(op);
    } catch {
      return null;
    }
  }

  private async head(): Promise<{ branch: string | null; sha: string | null }> {
    const [b, h] = await Promise.all([
      this.git.client.run({
        args: ["branch", "--show-current"],
        display: "git branch --show-current",
      }),
      this.git.client.run(journalQuery.headSha()),
    ]);
    return {
      branch: b.ok && b.stdout.trim() ? b.stdout.trim() : null,
      sha: h.ok ? h.stdout.trim() || null : null,
    };
  }

  private async tip(ref: string): Promise<string | null> {
    const res = await this.git.client.run({
      args: ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      display: `git rev-parse ${ref}`,
    });
    return res.ok ? res.stdout.trim() || null : null;
  }

  async switchBranch(name: string): Promise<ActionResult> {
    const before = await this.head();
    const res = await switchBranch(this.git.client, name);
    if (res.ok && before.sha) {
      this.record({ op: "switch", from: before.branch, fromSha: before.sha, to: name });
    }
    return res;
  }

  async createBranch(name: string, base: string): Promise<ActionResult> {
    const before = await this.head();
    const res = await createBranch(this.git.client, name, base);
    if (res.ok) await this.recordCreate(name, before.branch, true);
    return res;
  }

  async switchTrackNew(localName: string, remoteRef: string): Promise<ActionResult> {
    const before = await this.head();
    const res = await switchTrackNew(this.git.client, localName, remoteRef);
    if (res.ok) await this.recordCreate(localName, before.branch, true);
    return res;
  }

  /** Create a branch at a commit without switching (reflog recovery). */
  async createBranchAt(name: string, sha: string): Promise<ActionResult> {
    const res = await this.git.client.run(mutation.recreateBranch(name, sha));
    if (!res.ok) return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
    await this.recordCreate(name, null, false);
    return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
  }

  private async recordCreate(name: string, from: string | null, switched: boolean) {
    const sha = await this.tip(`refs/heads/${name}`);
    if (sha) this.record({ op: "create-branch", name, sha, from, switched });
  }

  async commit(message: string): Promise<CommitResult> {
    const before = await this.head();
    const res = await commitChanges(this.git.client, message);
    if (res.ok) {
      const after = await this.tip("HEAD");
      if (after) {
        this.record({
          op: "commit",
          branch: before.branch,
          before: before.sha,
          after,
          subject: res.subject ?? message.split("\n")[0] ?? "",
        });
      }
    }
    return res;
  }

  /**
   * Stash (including untracked files) and switch. Recorded only when both
   * steps succeed; a failed switch leaves the stash for the caller to report.
   */
  async stashAndSwitch(
    name: string,
    message: string,
  ): Promise<
    | { ok: true }
    | { ok: false; stage: "stash" | "switch"; result: Extract<ActionResult, { ok: false }> }
  > {
    const before = await this.head();
    const stash = await stashBeforeSwitch(this.git.client, message);
    if (!stash.ok) return { ok: false, stage: "stash", result: stash };
    const stashSha = await this.tip("refs/stash");
    const sw = await switchBranch(this.git.client, name);
    if (!sw.ok) return { ok: false, stage: "switch", result: sw };
    if (stashSha)
      this.record({ op: "stash-switch", from: before.branch, to: name, stashSha, message });
    return { ok: true };
  }

  async deleteBranches(
    specs: DeleteSpec[],
  ): Promise<{ outcomes: DeleteOutcome[]; entry: JournalEntry | null }> {
    const outcomes = await bulkDeleteBranches(this.git.client, specs);
    const deleted = outcomes.flatMap((o) =>
      o.ok && o.restoreSha ? [{ name: o.name, sha: o.restoreSha }] : [],
    );
    const entry = deleted.length ? this.record({ op: "delete-branches", branches: deleted }) : null;
    return { outcomes, entry };
  }

  async push(opts: {
    hasUpstream: boolean;
    remote: string;
    branch: string;
  }): Promise<ActionResult> {
    const res = await pushCurrent(this.git.client, opts);
    if (res.ok) this.record({ op: "push", branch: opts.branch, remote: opts.remote });
    return res;
  }

  private async runAction(command: { args: string[]; display: string }): Promise<ActionResult> {
    const res = await this.git.client.run(command);
    if (res.ok) return { ok: true, commandDisplay: res.commandDisplay, durationMs: res.durationMs };
    return { ok: false, error: res.error!, commandDisplay: res.commandDisplay };
  }

  /**
   * Discard working-tree changes to `paths` by stashing them (including
   * untracked files), so the discard is undoable rather than destructive.
   */
  async discard(paths: string[]): Promise<ActionResult> {
    const message = `branchit: discard ${paths.length === 1 ? paths[0] : `${paths.length} files`}`;
    const res = await this.runAction(workspaceCommands.stashPaths(message, paths));
    if (res.ok) {
      const stashSha = await this.tip("refs/stash");
      if (stashSha) this.record({ op: "discard", paths, stashSha });
    }
    return res;
  }

  async pull(mode: PullMode): Promise<ActionResult> {
    const before = await this.head();
    const res = await this.runAction(workspaceCommands.pull(mode));
    if (res.ok && before.sha) {
      const after = await this.tip("HEAD");
      if (after && after !== before.sha) {
        this.record({ op: "pull", branch: before.branch, mode, before: before.sha, after });
      }
    }
    return res;
  }

  async stashDrop(entry: StashEntry): Promise<ActionResult> {
    const res = await this.runAction(stashCommands.drop(entry.ref));
    if (res.ok) this.record({ op: "stash-drop", sha: entry.sha, message: entry.message });
    return res;
  }

  /** `git stash branch`: new branch at the stash's base, stash applied, then dropped. */
  async stashBranch(name: string, entry: StashEntry): Promise<ActionResult> {
    const before = await this.head();
    const res = await this.runAction(stashCommands.branch(name, entry.ref));
    if (res.ok) await this.recordCreate(name, before.branch, true);
    return res;
  }
}
