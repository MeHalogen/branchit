# Changelog

All notable changes to Branchit are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

## [0.7.0](https://github.com/MeHalogen/branchit/compare/branchit-v0.6.0...branchit-v0.7.0) (2026-11-19)


### Features

* Branchy foundation + branch-switcher vertical slice ([bd7ceca](https://github.com/MeHalogen/branchit/commit/bd7ceca95af79099e5a710a15dfd6d296149f532))
* **cli:** branchit demo, non-interactive sweep/branches/pr with --json, completions, lazy TUI ([358d654](https://github.com/MeHalogen/branchit/commit/358d654cc6bba264170e405df542b6cf03549a05))
* config system, first-run onboarding, CI, license ([7652136](https://github.com/MeHalogen/branchit/commit/765213671120e80ef31b993befa93c0f15b548f0))
* Phase 4 — stale branch sweeper with undo ([647fed7](https://github.com/MeHalogen/branchit/commit/647fed75424168f3f472f665355b5909610764b6))
* Phase 5 — conventional commit helper ([01f2a65](https://github.com/MeHalogen/branchit/commit/01f2a6506a2bcbaea7420b078982a04a6a716bbb))
* Phase 6 — pre-commit checks with repository trust model ([b44579d](https://github.com/MeHalogen/branchit/commit/b44579d9fff8a2a0cbfdb31b6b8159481af598f0))
* Phase 7 — PR readiness with push and host integration ([29b9cf4](https://github.com/MeHalogen/branchit/commit/29b9cf41290b7aaefb194806863ae146674d9b74))
* themes, animated progress, key overrides, optional AI commit message, large-repo speedups ([17ffeef](https://github.com/MeHalogen/branchit/commit/17ffeef1f11a32afaf80a9c7d2fb3a0ee2836b0c))
* universal undo via an operation journal, plus reflog recovery ([f081ffd](https://github.com/MeHalogen/branchit/commit/f081ffd24b4fea179c9459d5aa5d96784e869956))
* working tree + diff viewer, global search, sync, stash manager ([41593a8](https://github.com/MeHalogen/branchit/commit/41593a85f7e1da20d9fcc56c8e673ec19c1066bf))
* worktree manager, open-here shell integration, worktree-aware sweep ([39ff758](https://github.com/MeHalogen/branchit/commit/39ff758cbdab86eb620454b60ff124568b9445c5))


### Bug Fixes

* **journal:** never journal a stash the operation did not create ([3e474e9](https://github.com/MeHalogen/branchit/commit/3e474e9299c69524800e9c38bda732eb365084ed))
* keep Windows paths intact in quoted configured commands ([79c11bc](https://github.com/MeHalogen/branchit/commit/79c11bc71561f9cffb7ca0f96f5cfb2581822c66))
* **pkg:** bin path without ./ so npm 11 keeps the branchit command ([39c9a7b](https://github.com/MeHalogen/branchit/commit/39c9a7bb9692442802a8f0ce664c28dbf9366be2))
* **pkg:** keep the branchit bin when publishing with npm 11 ([bc9af02](https://github.com/MeHalogen/branchit/commit/bc9af025b2e4ba9b1c7ce280811e4444c23b4560))
* Windows paths in quoted configured commands; Windows perf headroom ([c1ed703](https://github.com/MeHalogen/branchit/commit/c1ed7035170d1fcad385dcf82b360da1b30cf93d))
* Windows-safe URL opening and test fixture paths ([b5ec41b](https://github.com/MeHalogen/branchit/commit/b5ec41b46ce5ce887bc6970796df78a8dc07b84a))
* **worktrees:** use Git's forward-slash paths on Windows ([71587ef](https://github.com/MeHalogen/branchit/commit/71587ef73aa961dc5f24dea1689eb62aae05e2d1))

## 0.6.0 — Polish

### Added
- **Themes**: `[ui] theme = "catppuccin" | "tokyo-night" | "gruvbox"` alongside
  `default` and `none`. `NO_COLOR` still always wins.
- **Animated progress**: a real spinner with elapsed time for fetch, push,
  pull and running checks (it was a static frame).
- **Key overrides**: `[keys] sweep = "x"` rebinds dashboard keys by command
  name; collisions, unknown names and reserved keys are reported at startup
  and fall back to the defaults. Help, hints and the palette show the live keys.
- **Optional AI commit message**: set `[ai] command` to any program that reads
  a diff on stdin and prints a message, then press `ctrl+g` in the commit flow
  to fill type, scope, subject and body. Off by default, no bundled provider,
  no API keys handled by Branchit, no shell, and the same explicit trust
  prompt as pre-commit checks.

### Changed
- **Large repositories**: the sweep scan runs with bounded parallelism (2,000
  branches: 2.0 s → 0.74 s), and the sweeper renders a window around the
  cursor instead of every row. `npm run bench` checks the 1 s budget.
- Configured commands (checks and `[ai]`) now honour quotes and backslash
  escapes when split into arguments, still without invoking a shell.
- The status bar wraps instead of squeezing key labels on narrow terminals.

### Fixed
- Inside double quotes, a backslash only escapes `\ " $ \``, so quoted
  Windows paths in `[checks]` / `[ai]` commands keep their separators.
- Undo never pops a stash the operation didn't create.
- Worktree paths use Git's forward-slash form on Windows.

## 0.5.0 — Worktrees for the parallel-agent era

### Added
- **Worktree manager (`t`)**: every checkout of the repository with its
  branch, uncommitted changes, ahead/behind and last activity. Add a worktree
  for an existing branch (`a`) or a new one (`n`), remove it (`d`, refused
  while it has changes unless you force it behind a red confirm), and prune
  stale entries (`p`). Adds and clean removals are undoable.
- New worktrees go to `../{repo}-wt/{branch}` by default; change it with
  `[worktrees] root` in `.branchit.toml`.
- **Open here**: `enter` on a worktree leaves Branchit with your shell in that
  directory. Install the wrapper once with
  `eval "$(branchit shell-init zsh)"` (or `bash` / `fish`). The branch
  switcher uses the same path when a branch is checked out in another
  worktree, instead of just erroring.
- The sweeper is worktree-aware: a merged branch checked out in a linked
  worktree is offered (never preselected) for remove-both, and undo restores
  both. `branchit sweep --yes` still only deletes branches checked out nowhere.
- `branchit worktrees [--json]` (alias `wt`) and `branchit shell-init`.

## 0.4.0 — The stubs are real now

### Added
- **Working tree (`w`)** with a diff viewer: file list (staged, modified,
  untracked, conflicted) and a coloured, scrollable diff of the selected file.
  `space` stages or unstages a file; in the diff, `n`/`N` move between hunks
  and `s`/`u` stage or unstage just that hunk (via `git apply --cached`).
  `x` discards a file's changes behind a red confirm; the changes are stashed
  first, so `u` brings them back.
- **Search (`/`)**: one fuzzy box over branches, commands, the last 300
  commits and every tracked file. Branches switch, commands run, changed files
  open in the working tree, commits can become a branch.
- **Sync (`y`)**: pull with an explicit fast-forward / merge / rebase choice
  and a command preview. Requires a clean tree; on conflicts it stops, lists
  the files and offers a one-key abort back to where you were. Pulls are
  journaled, so `u` undoes them with `git reset --keep`.
- **Stash manager (`z`)**: list with previews, apply, pop, turn a stash into
  a branch, and drop (undoable).

### Changed
- All of Branchit's git calls run with `GIT_OPTIONAL_LOCKS=0`, so background
  status reads never take `index.lock` and collide with your own git commands.

## 0.3.0 — Git with an undo button

### Added
- **Universal undo.** Every operation Branchit performs is recorded in an
  operation journal (`.git/branchit/journal.jsonl`). Press `u` on the
  dashboard, or run `branchit undo`, to see the last operation and the exact
  inverse commands before anything runs. Covers branch switches, new
  branches (including tracking branches), commits (soft reset, changes stay
  staged), stash-and-switch (switch back and pop that exact stash) and branch
  deletions from the sweeper or `branchit sweep --yes`.
- Undo re-validates against the repository first and refuses, with a reason,
  when you have moved on since (new commits, a different branch, a popped
  stash), so it never clobbers later work.
- Pushes are recorded but never undone; the undo screen says so plainly and
  points to `git revert`.
- `branchit undo --list` shows the recorded history; `--json` everywhere.
- **Recover lost work** (`:` → "recover"): browse the HEAD reflog with
  relative times, see the commit's stat and whether any branch still holds
  it, and restore it as a new `recovered/<sha>` branch.

## 0.2.0 — Zero-friction first run

### Added
- `branchit demo` opens the TUI in a throwaway, realistic sandbox repository
  (merged, squash-merged, unmerged, ahead and remote-gone branches). Try it
  with `npx branchit demo`; nothing touches your own repositories.
- `branchit sweep` without the TUI: dry-run by default, `--yes` deletes only
  branches proven merged and prints how to restore each one. Ends with a
  one-line, shareable report card
  (`8 branches · 4 safely merged · 1 likely squash-merged · oldest 13 months`).
- `--json` output for `sweep`, `branches`, `pr` and `status`.
- `branchit branches` and `branchit pr` non-interactive commands.
- `branchit completions zsh|bash|fish`.
- Short flags `-h`, `-v`, `-y`, `-n`; unknown commands now fail with a hint.

### Changed
- Startup: Ink and React load only on the interactive path, so
  `branchit --version` and every scripted command start in ~40 ms (was ~190 ms).
- The version is read from `package.json` instead of being hardcoded.

### Fixed
- Opening a URL on Windows no longer goes through `cmd /c start`, which could
  interpret `&` in a URL as a command separator.

### Development
- Biome lint/format in CI and `prepublishOnly`; Windows added to the CI matrix.
- `demo.tape` is path-independent; regenerate the GIF with `npm run demo:gif`.

## 0.1.0

Initial release: dashboard, fuzzy branch switcher, new-branch flow, stale-branch
sweeper with undo, conventional commit flow with trusted pre-commit checks, PR
readiness, layered TOML config.
