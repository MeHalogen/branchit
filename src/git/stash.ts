/** Stash listing and stash-manager actions. */
import type { GitClient } from "./client.js";
import type { GitCommand } from "./command.js";

export interface StashEntry {
  ref: string;
  index: number;
  sha: string;
  at: string;
  message: string;
}

const FORMAT = "%gd%x1f%H%x1f%cI%x1f%gs";

export function parseStashList(stdout: string): StashEntry[] {
  const out: StashEntry[] = [];
  for (const line of stdout.split("\n")) {
    const [ref, sha, at, message] = line.split("\x1f");
    if (!ref || !sha) continue;
    const m = ref.match(/\{(\d+)\}$/);
    out.push({
      ref,
      index: m ? Number(m[1]) : out.length,
      sha,
      at: at ?? "",
      message: message ?? "",
    });
  }
  return out;
}

function cmd(args: string[]): GitCommand {
  return { args, display: `git ${args.join(" ")}` };
}

export const stashCommands = {
  list: () => cmd(["stash", "list", `--format=${FORMAT}`]),
  /** Patch for a stash including untracked files (git ≥ 2.32), no color. */
  show: (ref: string) =>
    cmd(["stash", "show", "--patch", "--include-untracked", "--no-color", ref]),
  showLegacy: (ref: string) => cmd(["stash", "show", "--patch", "--no-color", ref]),
  apply: (ref: string) => cmd(["stash", "apply", "--index", ref]),
  pop: (ref: string) => cmd(["stash", "pop", "--index", ref]),
  drop: (ref: string) => cmd(["stash", "drop", ref]),
  /** Re-add a dropped stash commit to the stash list (undo of drop). */
  store: (sha: string, message: string) => cmd(["stash", "store", "--message", message, sha]),
  branch: (name: string, ref: string) => cmd(["stash", "branch", name, ref]),
};

export async function listStashes(client: GitClient): Promise<StashEntry[]> {
  const res = await client.run(stashCommands.list());
  return res.ok ? parseStashList(res.stdout) : [];
}

export async function stashPatch(client: GitClient, ref: string): Promise<string> {
  const res = await client.run(stashCommands.show(ref));
  if (res.ok) return res.stdout;
  const legacy = await client.run(stashCommands.showLegacy(ref));
  return legacy.ok ? legacy.stdout : "";
}
