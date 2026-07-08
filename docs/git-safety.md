# Git safety

Branchy touches real repositories. These are the guarantees the implementation
makes, and where they live.

## Shell-injection prevention

- Every Git invocation is an **argument array**, executed with `shell: false`
  (`src/git/client.ts`). No user value is ever concatenated into a shell string.
- Command construction is centralized in `src/git/command.ts`. Nothing else in
  the codebase spawns Git.
- Refs and paths that could begin with `-` are placed after a `--` terminator so
  Git cannot interpret a branch or file name as an option. Covered by the
  integration test "does not treat a branch name starting with '-' as a git
  option".

## Terminal-control sanitization

Branch names and commit subjects are untrusted input. `sanitizeForDisplay`
(`src/utils/format.ts`) strips C0/C1 control bytes and ESC before rendering, so a
malicious ref cannot inject ANSI escapes into the UI. All metadata rendered in
screens passes through it.

## Destructive operations

- **No silent stashing.** If a switch is blocked by local changes
  (`dirty_worktree`), Branchy shows an explicit modal with the exact command
  preview and only stashes on confirmation.
- **Partial completion is reported honestly.** If a stash succeeds but the
  following switch fails, the user is told their changes are safe in the stash —
  never a false success.
- **Safe deletes use `-d`.** The command layer exposes `safeDeleteBranch` (`-d`,
  refuses unmerged) and `forceDeleteBranch` (`-D`) as distinct operations. Force
  deletion is a separate, explicitly-confirmed path (sweeper, roadmap).
- Success toasts auto-dismiss; nothing important is hidden behind them.

## Merged detection

"Merged" means the branch tip is **reachable from the base branch** per Git
ancestry (`git branch --merged <base>`), never a name or age heuristic. The
sweeper's classifier (`src/workflows/sweep.ts`) is pure and unit-tested; it
gathers facts via bounded Git calls and emits a classification, confidence, and
human-readable reasons per branch. Squash-merge is **inferred** from
patch-equivalence (`git cherry` shows no `+` lines) on a non-ancestor branch and
is labelled `squash_suspected` / confidence `likely` — never "merged". Only
proven-merged, unprotected branches are preselected; safe deletion uses `-d`
(which itself refuses unmerged branches), and force `-D` is a separate,
explicitly-confirmed path. Every bulk delete records tips so it can be undone.

## Protected branches & worktrees

- The current branch and branches checked out in another worktree cannot be
  casually switched-away-from or deleted. Worktree ownership is detected via
  `for-each-ref %(worktreepath)` and surfaced in the UI (see the worktree
  integration test).
- Default protected patterns (`main`, `master`, `develop`, `trunk`, plus the
  base branch's leaf and `prefix/*` globs) are enforced by the sweeper: matching
  branches are shown but never selectable or deletable.

## Repository trust (roadmap)

Repository-defined check commands (e.g. `.branchy.toml` `[checks]`) can execute
arbitrary code. The design requires explicit, per-repository trust before first
execution and re-prompting when the command set changes. This is documented here
so the safety model and implementation stay aligned as it lands.

## In-progress operations

Merge/rebase/cherry-pick/revert are detected from git-dir marker files
(`detectOperationState`) and take priority in the dashboard, discouraging
unrelated actions until resolved.
