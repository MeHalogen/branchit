# X / Bluesky thread draft

1/ I built a Git TUI where every action has an undo button. 🌿

`npx branchit demo` opens it on a throwaway repo — nothing to install.
[undo.gif]

2/ Branchit journals every operation it performs. `u` shows the last one and
the exact inverse commands before running them — branch deletes, commits,
stash drops, discards, pulls, worktrees. Pushes: never.

3/ `npx branchit sweep` in any repo:
"14 branches · 9 safely merged · 2 likely squash-merged · oldest 13 months"
Ancestry + patch equivalence, not age. `--yes` deletes only the proven ones.
[sweep.gif]

4/ Running several coding agents at once? `t` is a worktree manager: one
checkout per branch, dirty state at a glance, and Enter drops your shell into
it. [worktrees.gif]

5/ MIT, TypeScript + Ink, argv-only git calls, CI on Linux/macOS/Windows.
github.com/MeHalogen/branchit
