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
- **Phase 5 — Conventional commit** (`c`): inspects real working-tree state;
  interactive staging (reconciled `add` / `restore --staged`) when nothing is
  staged; type selection with deterministic suggestion (docs/test/build);
  scope with directory inference; subject with non-blocking validation;
  breaking-change (`!`) toggle; optional body; full message preview; real commit
  via `git commit -F -` (Git hooks run — a failing hook is surfaced, not
  bypassed). Message building/inference/validation are pure and unit-tested.
- **Phase 7 — PR readiness** (`p`): checklist from real branch state (clean tree,
  ahead/behind base, upstream, unpushed commits); push (setting upstream when
  needed); host provider that parses SSH/HTTPS remotes into a compare/MR URL
  (GitHub full, GitLab best-effort); optional `gh` detection; open-in-browser.
  URL parsing, compare-URL building, and readiness are pure and unit-tested.
- **Phase 6 — Pre-commit checks + repository trust model:** detects known
  `package.json` scripts (advisory only); a repo must be explicitly trusted for
  a specific command set before Branchy runs anything, and trust is re-prompted
  when the set changes (hash-keyed store under the user config dir). Checks run
  with argv + `shell:false`, report per-check status/duration, cancel on Esc,
  and block the commit on first failure — with an explicit "commit anyway".
  Git hooks still run on the actual commit.
- **Extras that are real:** `n` new-branch flow, `f` fetch, `r` refresh,
  non-interactive `branchy switch <name>`, `branchy status [--plain]`, no-repo
  and non-TTY handling, no-color / ASCII modes, demo-repo generator.

- **Config system** — layered TOML (`defaults → user → repo → CLI flags`),
  validated with `zod` so a bad field yields `file:field — message` and is
  skipped rather than crashing. Drives protected patterns, base branch, commit
  types/scopes/limits/require-scope, check commands, and UI (preview/icons/
  theme). `branchy config` shows the resolved result and sources.
- **Polish + packaging:** one-screen first-run onboarding; MIT license; GitHub
  Actions CI (typecheck + test + build on Linux/macOS × Node 20/22); annotated
  `.branchy.example.toml`; Branchy dogfoods its own `.branchy.toml`.

Tests: 112 passing (unit + real-git integration + TUI-driven, incl. real
squash-merge detection, delete/undo round-trips, a real pre-commit hook failure
being surfaced, a real push that sets an upstream, the trust→run→commit checks
flow, config precedence/validation, and onboarding).

## Planned (not implemented)

- Diff viewer, sync strategies (pull merge/rebase), stash manager, reflog
  recovery — see the roadmap in the README.

See [architecture.md](architecture.md) for where these slot in.
