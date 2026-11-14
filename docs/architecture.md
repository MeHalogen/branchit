# Architecture

Branchit separates concerns into clear layers. The UI never executes Git strings;
it dispatches to workflows, which validate state and call typed actions, which
build argument arrays that a single safe executor runs.

```
┌────────────────────────────────────────────────────────────┐
│ cli.ts             entrypoint: arg parsing, TTY handling,    │
│                    subcommands (status/doctor/switch), Ink   │
├────────────────────────────────────────────────────────────┤
│ app/               App state machine, screen routing,        │
│                    orchestration (switch/fetch/create),      │
│                    toast + modal, theme context, data loader │
├───────────────┬────────────────────────────────────────────┤
│ screens/       │ components/    reusable UI primitives       │
│  Dashboard     │  BranchRow, StatusBar, Toast, ConfirmModal  │
│  BranchSwitcher│                                             │
│  NewBranch     │ keys/          command + keybinding registry│
│  CommandPalette│ theme/         semantic tokens + glyphs      │
│  HelpOverlay   │ search/        deterministic fuzzy ranking   │
│  NoRepo        │ utils/         formatting + sanitization     │
├────────────────────────────────────────────────────────────┤
│ git/  (domain)                                               │
│   repository.ts  detection + typed RepositoryState assembly  │
│   queries live in command.query.*  (read-only)               │
│   actions.ts / sync.ts  mutations returning typed results    │
│   command.ts     ALL command construction (argv + display)   │
│   parsers.ts     porcelain v2 / for-each-ref / worktree      │
│   recent.ts      reflog-based recency ranking                │
│   models.ts      domain types (Branch, RepositoryState, …)   │
│   errors.ts      typed GitError taxonomy + classification    │
│   client.ts      the ONLY process executor (shell:false)     │
└────────────────────────────────────────────────────────────┘
```

## Data flow: switching a branch

1. `BranchSwitcher` dispatches `onSelect(branch)` — it never runs Git.
2. `App.onSelectBranch` validates: current? in another worktree? remote-only?
3. For a local branch it calls `switchBranch(client, name)` (`git/actions.ts`).
4. `actions` builds `mutation.switchBranch(name)` → argv `["switch","--",name]`.
5. `GitClient.run` executes with `shell:false`, captures stdout/stderr/exit/time.
6. On failure the error is classified (`errors.ts`) into a typed kind. A
   `dirty_worktree` result opens an explicit stash modal — never a silent stash.
7. On success the app reloads state and shows a transient success toast.

## State model

Screen state is an explicit discriminated `View` union plus optional `modal` and
`toast`, rather than a bag of booleans. Async operations set a `busy` label that
disables global input, serializing mutations. Repository data
(`RepoData = { state, status, branches, recentRanks }`) is reloaded after every
mutation so the UI reflects Git as the source of truth.

## Performance

- No network on launch; `fetch` is an explicit action with a timeout.
- Branch metadata is one batched `for-each-ref`; status is one
  `status --porcelain=v2 -z`. No per-branch subprocess (no N+1).
- Fuzzy filtering is pure and in-memory, computed with `useMemo`.

## Configuration & integrations (roadmap)

`config/` (schema via `zod`) and `integrations/` (GitHost provider interface for
GitHub/GitLab) are designed for but intentionally not built in this slice — see
[progress.md](progress.md).

## Since 0.2: CLI split, journal, workflows

- **Lazy entry.** `src/cli.ts` parses arguments and runs every scripted command
  (`sweep`, `undo`, `branches`, `pr`, `status`, `worktrees`, `completions`,
  `shell-init`) without importing Ink or React; the TUI (`src/tui.tsx`) is a
  dynamic import. `test/cli-startup.test.ts` enforces this.
- **Operation journal.** `src/journal/record.ts` (`Recorder`) is the choke
  point for every mutation: it captures refs before, runs the plain action from
  `src/git/`, and appends to `<git-dir>/branchit/journal.jsonl` on success.
  `planUndo` (pure) turns an entry into inverse commands after validating it
  against live refs; `executeUndo` runs them and records the undo.
- **Workflows** stay UI-free: `workflows/sweep.ts` (classification, report
  card, JSON), `workflows/worktrees.ts`, `workflows/ai-commit.ts`,
  `git/workspace.ts` (diffs, hunk patches, pull conflicts), `git/stash.ts`.
