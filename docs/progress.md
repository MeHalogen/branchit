# Progress

Honest status of what is real vs. planned. Nothing marked done is faked; planned
features are surfaced in-app as "(soon)" / "planned", never as working buttons.

## Done — first vertical slice

- **Phase 0 — Bootstrap.** TypeScript + Ink + execa + vitest + tsup, strict
  tsconfig, ADR 001, docs. `branchy --version`, `--help`, `doctor` work.
- **Phase 1 — Git foundation.** Safe executor (`shell:false`, argv, typed
  errors, timeouts), porcelain-v2 / for-each-ref / remote / worktree parsers,
  repository detection & typed state, default-branch detection, reflog recency.
  Verified by real-Git integration tests.
- **Phase 2 — TUI shell.** Ink app frame, responsive width, keybinding/command
  registry, dashboard, help overlay, fuzzy command palette (`:` / Ctrl-K),
  status bar, transient toasts, contextual suggestions, operation banner.
- **Phase 3 — Branch switcher.** Search-first fuzzy switcher with ranking,
  arrow/Ctrl-n/p navigation, details panel, command preview; real switching;
  remote-only → tracking-branch creation; dirty-tree → explicit stash modal with
  honest partial-failure reporting; worktree/current-branch guards.
- **Phase 4 — Stale branch sweeper** (`s`): pure classification engine
  (safe-merged / squash-suspected / remote-gone / unmerged / protected) with
  confidence + reasons, grounded in Git ancestry (`branch --merged`) and
  patch-equivalence (`git cherry`); conservative preselection (only proven
  merged); safe `-d` vs explicit force `-D`; command-preview confirmation;
  honest partial-failure reporting; and **undo** (recreate at recorded tips).
- **Extras that are real:** `n` new-branch flow, `f` fetch, `r` refresh,
  non-interactive `branchy switch <name>`, `branchy status [--plain]`, no-repo
  and non-TTY handling, no-color / ASCII modes, demo-repo generator.

Tests: 56 passing (unit + real-git integration + TUI-driven, incl. real
squash-merge detection and delete/undo round-trips).

## Planned (surfaced but not implemented)

- **Phase 5 — Conventional commit** (`c`): interactive staging, type/scope/
  subject, preview, real commit.
- **Phase 6 — Pre-commit checks:** command detection + repository trust model.
- **Phase 7 — PR readiness** (`p`) + optional GitHub CLI integration.
- **Config system** (`.branchy.toml`, `zod`), diff viewer, sync strategies.

See [architecture.md](architecture.md) for where these slot in.
