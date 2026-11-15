# r/commandline draft

**Title:** branchit sweep: one command to see your dead Git branches (and a TUI to clean them up safely)

```
$ npx branchit sweep
Sweep against main

Safely merged (4)
  chore/bump-sdk           5mo  tip reachable from main
  ...
Needs review (4) — never deleted automatically
  feat/receipts            1mo  changes appear represented in base · not an ancestor of main
  ...

9 branches · 4 safely merged · 1 likely squash-merged · 1 upstream gone · 2 unmerged · oldest 13 months
```

Classification is by ancestry and `git cherry` patch equivalence, not branch
age. `--yes` deletes only the proven-merged ones and prints how to restore
each; `branchit undo --yes` puts them all back. Everything has `--json`.

The TUI (`branchit`) adds a diff viewer with hunk staging, stash manager,
worktree manager, themes (catppuccin / tokyo-night / gruvbox) and rebindable
keys. Starts in ~40 ms for scripted commands.

https://github.com/MeHalogen/branchit — `npx branchit demo` for a sandbox.

*(GIF: docs/gifs/sweep.gif)*
