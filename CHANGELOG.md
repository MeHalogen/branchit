# Changelog

All notable changes to Branchit are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

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
