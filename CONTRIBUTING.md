# Contributing to Branchit

Thanks for helping! Branchit is small on purpose; the bar for a change is that
it keeps every Git mutation previewed, safe and (where possible) undoable.

## Setup

```bash
git clone https://github.com/MeHalogen/branchit.git
cd branchit
npm install
npm run dev            # run the TUI from source in the current repo
npm run demo:repo      # or seed a sandbox repo to play in
```

Node 20 or 22 and Git ≥ 2.23 are what CI uses.

## Before you open a PR

```bash
npm run lint           # Biome (npm run format fixes most issues)
npm run typecheck
npm test               # unit + real-git integration + TUI tests
npm run build
```

CI runs the same on Linux, macOS and Windows with Node 20 and 22.

## How the code is organised

- `src/git/` — the only code that spawns `git` (`client.ts`), typed command
  builders and parsers. Argument arrays only, `shell: false`, `--` before refs.
- `src/journal/` — the operation journal: `Recorder` is the choke point every
  mutation goes through; `planUndo` is pure and validated against live refs.
- `src/workflows/` — UI-free logic (sweep classification, PR readiness,
  worktrees, AI message parsing). Prefer adding logic here, with unit tests.
- `src/screens/`, `src/app/` — Ink/React UI. `src/cli.ts` must stay free of
  Ink/React imports so scripted commands start fast (a test enforces this).

More in [docs/architecture.md](docs/architecture.md).

## Tests

- Pure logic gets unit tests.
- Git behaviour is tested against real throwaway repositories
  (`test/fixtures/gitRepo.ts`), never mocks.
- TUI flows use `ink-testing-library`; wait with `waitForFrame`/`waitUntil`
  from `test/fixtures/wait.ts`, never fixed sleeps (Windows runners are slow).
- Every new mutation needs: a command preview, a typed error, a journal entry,
  and an integration test that undoes it.

## Commits and releases

Use [Conventional Commits](https://www.conventionalcommits.org/)
(`feat(sweep): …`, `fix: …`). Releases are cut by release-please from those
messages, so the type matters: `feat` bumps minor, `fix` bumps patch.
Branchit's own commit flow (`c`) will help you write them.

## Good first issues

Look for the [`good first issue`](https://github.com/MeHalogen/branchit/labels/good%20first%20issue)
label. Comment on an issue before starting so work isn't duplicated.
