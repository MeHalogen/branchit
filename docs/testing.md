# Testing

Branchit is tested against **real Git**, not mocks. Correctness of Git semantics
is the product, so tests spawn real `git` over temporary repositories.

## Commands

```bash
npm test            # run the whole suite once (vitest)
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
```

## Layers

### Unit tests (pure, fast)

- `test/parsers.test.ts` — porcelain v2 (`-z`, renames with a separate NUL orig
  path, unmerged entries, detached HEAD), `for-each-ref` (upstream tracking,
  `gone`, skipping `origin/HEAD`), remotes, worktree list.
- `test/rank.test.ts` — the fuzzy ranking invariants: exact > prefix > token >
  subsequence; recency ordering for empty queries; highlight indices.
- `test/format.test.ts` — relative time, middle-truncation, control-sequence
  sanitization, slugify.

### Integration tests (real repos, real git)

`test/fixtures/gitRepo.ts` builds throwaway repos in the OS temp dir and can
create a **bare repo as a fake remote**, so nothing touches the network.
`test/repository.integration.test.ts` covers: detection (in/out of a repo),
clean vs dirty tree with counts, unborn repo, detached HEAD, local branch
listing, ahead/behind vs a remote upstream, worktree flagging, default-branch
detection (origin/HEAD and local fallback), switching, dirty-switch failure
(`dirty_worktree`), remote-only tracking-branch creation, and the `--` option
guard for hyphen-led names.

### TUI tests (drive the real Ink app)

`test/tui.test.tsx` renders `<App>` with `ink-testing-library` and drives it via
keystrokes: dashboard content, opening the switcher, fuzzy filtering `payret` →
`feat/payment-retry`, pressing Enter and asserting the **real branch actually
switched**, command previews, and Esc returning to the dashboard.

## Demo repository

```bash
npm run demo:repo   # prints a path to a repo with varied branch states
```

Creates merged, unmerged, ahead, and remote-gone branches plus a dirty tree —
useful for screenshots, GIFs, and manual testing.

## Conventions

- Prefer real Git over stubs; assert on typed results, not stderr strings.
- Each integration test cleans up its temp repos in `afterEach`.
- Control characters in test fixtures are built via `String.fromCharCode` so
  source files contain no literal control bytes.
