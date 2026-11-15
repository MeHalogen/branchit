# Good first issues (drafts)

Not yet filed. Each is small, self-contained and has a clear test.

1. **`--theme <name>` CLI flag** — override `[ui] theme` for one run. Parse a
   value flag in `src/cli.ts` (no Ink import!), pass it to `launchTui`. Test:
   unit test for argument parsing.
2. **Include `worktreePath` in `branchit sweep --json`** — the field exists on
   `SweepCandidate`; add it to `sweepToJson` and its test.
3. **ASCII fallbacks for "↑ N more" / "↓ N more" in the sweeper** — use theme
   glyphs so `--ascii` output has no Unicode arrows.
4. **Show the stash count on the dashboard** — one `git stash list` call in
   `loadRepoData`; render next to the working-tree counts.
5. **Show the worktree count on the dashboard** — reuse
   `git worktree list --porcelain` parsing.
6. **`branchit doctor` reports shell integration** — say whether
   `BRANCHIT_CD_FILE` is set (i.e. the `shell-init` wrapper is active).
7. **Complete `--theme` values and `[keys]` names in shell completions** —
   extend `src/commands/completions.ts` and its test.
8. **PowerShell `shell-init`** — a `branchit` function that sets
   `$env:BRANCHIT_CD_FILE` and `Set-Location`s afterwards.
9. **`branchit undo <id>`** — undo a specific entry from `--list` (only if it
   is the most recent not-undone one, or explain why not).
10. **Journal `fetch --prune`** — record pruned remote-tracking refs so `u` can
    restore them with `git update-ref`.

Label all `good first issue`; 9 and 10 also `help wanted`.
