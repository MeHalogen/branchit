# r/git draft

**Title:** I made a Git TUI that keeps an operation journal so branch deletes, commits, stash drops and discards can be undone

Most Git mistakes are recoverable, but the recovery is different every time
(`git branch <name> <sha>`, `git reset --soft`, `git stash store`,
`git reset --keep`…). Branchit records what it does to
`.git/branchit/journal.jsonl` and computes the inverse:

- shows you the exact commands before running them,
- validates against live refs first (refuses if HEAD moved, the stash is
  gone, the branch got new commits),
- never "undoes" a push.

For things you did outside Branchit, there's a reflog browser that previews
each commit, tells you whether any branch still contains it, and restores it
as a new branch.

`npx branchit demo` to try it on a sandbox repo. Source:
https://github.com/MeHalogen/branchit

Curious how others think about undo for pull (I use `reset --keep`) and for
force-removed worktrees (not undoable — the changes are gone).

*(GIF: docs/gifs/undo.gif)*
