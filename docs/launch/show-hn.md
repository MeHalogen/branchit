# Show HN draft

**Title:** Show HN: Branchit – a Git TUI where every action has an undo button

**URL:** https://github.com/MeHalogen/branchit

**Text:**

I kept doing the same small Git recoveries by hand: re-creating a branch I
deleted too early, `git reset --soft` after committing to the wrong branch,
digging a commit out of the reflog. So I built a TUI that records every
operation it performs in a journal and can reverse it.

Press `u` (or run `branchit undo`) and it shows the last operation and the
exact inverse commands before running anything. It re-checks the repository
first and refuses if you have moved on since, so an undo never clobbers newer
work. Pushes are deliberately not undoable.

The other two things I use daily:

- `npx branchit sweep` lists dead branches by Git ancestry and patch
  equivalence (so squash-merged branches are caught), not by age, and ends
  with a one-line summary like
  `14 branches · 9 safely merged · 2 likely squash-merged · oldest 13 months`.
- A worktree manager (`t`) for running several branches — or several coding
  agents — side by side, with a tiny shell hook so Enter actually cds you
  into the worktree.

Try it without installing anything: `npx branchit demo` opens it on a
throwaway sandbox repository.

It's TypeScript + Ink, MIT. Every git call is argv-only with `shell: false`,
repository-defined commands need explicit trust, and CI runs on Linux, macOS
and Windows. lazygit does far more overall; Branchit is narrower and focused
on making everyday mutations previewable and reversible.

Feedback on the undo semantics especially welcome — what would you expect to
be undoable that isn't?

*(GIF: docs/gifs/undo.gif)*
