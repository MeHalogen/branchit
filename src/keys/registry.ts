/**
 * Central keybinding + command registry.
 *
 * Keeping bindings in one place (rather than scattered `useInput` literals)
 * gives a single source of truth for the help screen, the command palette, and
 * collision detection, and leaves room for future user customization.
 */

export type CommandId =
  | "dashboard.switchBranch"
  | "dashboard.newBranch"
  | "dashboard.commit"
  | "dashboard.sweep"
  | "dashboard.fetch"
  | "dashboard.prepare"
  | "dashboard.workingTree"
  | "dashboard.sync"
  | "dashboard.stash"
  | "dashboard.worktrees"
  | "global.undo"
  | "global.recover"
  | "global.help"
  | "global.palette"
  | "global.search"
  | "global.refresh"
  | "global.quit";

export interface Command {
  id: CommandId;
  title: string;
  /** Single-key shortcut on the dashboard (if any). */
  shortcut?: string;
  category: "Branches" | "Commit" | "Cleanup" | "Sync" | "View" | "App";
  keywords: string[];
}

export const COMMANDS: Command[] = [
  {
    id: "dashboard.switchBranch",
    title: "Switch branch",
    shortcut: "b",
    category: "Branches",
    keywords: ["checkout", "change", "switch", "branch", "co"],
  },
  {
    id: "dashboard.newBranch",
    title: "New branch",
    shortcut: "n",
    category: "Branches",
    keywords: ["create", "new", "branch", "start"],
  },
  {
    id: "dashboard.commit",
    title: "Conventional commit",
    shortcut: "c",
    category: "Commit",
    keywords: ["commit", "conventional", "cc", "message"],
  },
  {
    id: "dashboard.sweep",
    title: "Sweep merged branches",
    shortcut: "s",
    category: "Cleanup",
    keywords: ["clean", "sweep", "stale", "delete", "prune", "merged"],
  },
  {
    id: "dashboard.fetch",
    title: "Fetch remote",
    shortcut: "f",
    category: "Sync",
    keywords: ["fetch", "remote", "update", "refs"],
  },
  {
    id: "dashboard.prepare",
    title: "Prepare PR",
    shortcut: "p",
    category: "Sync",
    keywords: ["pr", "pull request", "prepare", "readiness"],
  },
  {
    id: "dashboard.workingTree",
    title: "Working tree status",
    shortcut: "w",
    category: "View",
    keywords: ["status", "working", "tree", "files", "diff"],
  },
  {
    id: "dashboard.sync",
    title: "Pull (merge / rebase / fast-forward)",
    shortcut: "y",
    category: "Sync",
    keywords: ["pull", "sync", "update", "rebase", "merge", "fast-forward"],
  },
  {
    id: "dashboard.stash",
    title: "Stashes",
    shortcut: "z",
    category: "Commit",
    keywords: ["stash", "shelve", "wip", "pop", "apply"],
  },
  {
    id: "dashboard.worktrees",
    title: "Worktrees",
    shortcut: "t",
    category: "Branches",
    keywords: ["worktree", "parallel", "agents", "checkout", "workspace"],
  },
  {
    id: "global.search",
    title: "Search everything",
    shortcut: "/",
    category: "View",
    keywords: ["search", "find", "files", "commits", "branches", "go to"],
  },
  {
    id: "global.undo",
    title: "Undo last operation",
    shortcut: "u",
    category: "App",
    keywords: ["undo", "revert", "back", "oops", "restore"],
  },
  {
    id: "global.recover",
    title: "Recover lost work (reflog)",
    category: "App",
    keywords: ["recover", "reflog", "lost", "restore", "time machine", "rescue"],
  },
  {
    id: "global.refresh",
    title: "Refresh repository",
    shortcut: "r",
    category: "App",
    keywords: ["refresh", "reload", "rescan"],
  },
  {
    id: "global.help",
    title: "Help",
    shortcut: "?",
    category: "App",
    keywords: ["help", "keys", "shortcuts"],
  },
  {
    id: "global.quit",
    title: "Quit",
    shortcut: "q",
    category: "App",
    keywords: ["quit", "exit", "close"],
  },
];

export function commandByShortcut(key: string): Command | undefined {
  return COMMANDS.find((c) => c.shortcut === key);
}

/** Assert at module load that no two commands share a dashboard shortcut. */
function assertNoShortcutCollisions(): void {
  const seen = new Map<string, CommandId>();
  for (const c of COMMANDS) {
    if (!c.shortcut) continue;
    const existing = seen.get(c.shortcut);
    if (existing) {
      throw new Error(`Keybinding collision on '${c.shortcut}': ${existing} vs ${c.id}`);
    }
    seen.set(c.shortcut, c.id);
  }
}
assertNoShortcutCollisions();
