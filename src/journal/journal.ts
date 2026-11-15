/**
 * Operation journal: an append-only record of every mutation Branchit makes,
 * kept at `<git-dir>/branchit/journal.jsonl`. It is what makes `branchit undo`
 * possible for more than one kind of action. Each entry stores the refs as
 * they were *before* the operation, so the inverse can be computed later and
 * validated against the repository as it is *now*.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type JournalOp =
  | { op: "switch"; from: string | null; fromSha: string; to: string }
  | {
      op: "create-branch";
      name: string;
      sha: string;
      /** Branch HEAD was on before, when `switched`. */
      from: string | null;
      switched: boolean;
    }
  | { op: "delete-branches"; branches: { name: string; sha: string }[] }
  | {
      op: "commit";
      branch: string | null;
      /** Parent commit; null for the first commit in a repository. */
      before: string | null;
      after: string;
      subject: string;
    }
  | {
      op: "stash-switch";
      from: string | null;
      to: string;
      stashSha: string;
      message: string;
    }
  | { op: "push"; branch: string; remote: string }
  | { op: "undo"; of: string };

export type JournalEntry = JournalOp & { id: string; at: string };

export function journalPath(gitDir: string): string {
  return join(gitDir, "branchit", "journal.jsonl");
}

export class Journal {
  constructor(readonly file: string) {}

  static forGitDir(gitDir: string): Journal {
    return new Journal(journalPath(gitDir));
  }

  append(op: JournalOp): JournalEntry {
    const entry = {
      ...op,
      id: randomUUID().slice(0, 8),
      at: new Date().toISOString(),
    } as JournalEntry;
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
    return entry;
  }

  /** All entries, oldest first. Unreadable lines are skipped, never fatal. */
  read(): JournalEntry[] {
    if (!existsSync(this.file)) return [];
    const out: JournalEntry[] = [];
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as JournalEntry;
        if (parsed && typeof parsed.op === "string" && typeof parsed.id === "string") {
          out.push(parsed);
        }
      } catch {
        // A torn write or manual edit; ignore the line.
      }
    }
    return out;
  }

  /** Operations not yet undone (and not undo records themselves), newest first. */
  history(): JournalEntry[] {
    const entries = this.read();
    const undone = new Set(entries.flatMap((e) => (e.op === "undo" ? [e.of] : [])));
    return entries.filter((e) => e.op !== "undo" && !undone.has(e.id)).reverse();
  }

  /** The most recent operation that has not been undone. */
  lastUndoable(): JournalEntry | null {
    return this.history()[0] ?? null;
  }
}
