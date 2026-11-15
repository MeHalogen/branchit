# Changelog

All notable changes to Branchit are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

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
