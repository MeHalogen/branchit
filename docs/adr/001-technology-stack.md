# ADR 001 — Technology stack

- **Status:** Accepted
- **Date:** 2026-07-08

## Context

Branchit is a keyboard-first, interactive TUI for everyday Git workflows. It must
feel instant, render richly, treat destructive operations safely, and be highly
testable against real Git behavior. Two credible stacks were considered:

- **A — TypeScript + Node.js + Ink** (React-style component model for the
  terminal), `execa` for process execution, `zod` for config validation,
  `vitest` for tests, `tsup` for bundling.
- **B — Rust + Ratatui + Crossterm**, single static binary, excellent startup.

## Decision

**We chose Option A (TypeScript + Node.js + Ink).**

## Rationale

Weighing the criteria the brief calls out (startup, packaging, TUI maturity,
testability, keyboard quality, process execution, maintainability, contributor
accessibility, future plugins):

1. **Toolchain availability & iteration speed.** The target environment has
   Node 25 and npm ready; Rust/cargo is not installed. Ink's declarative model
   lets us build a polished, responsive UI quickly, which matters because the
   product's value is concentrated in interaction quality, not raw compute.
2. **Testability against real Git.** Our correctness story depends on driving
   real `git` processes over temporary repositories. `execa` + `vitest` make
   spawning processes and asserting on typed results straightforward, and
   `ink-testing-library` lets us drive the actual UI through keystrokes.
3. **Git semantics.** We deliberately shell out to the Git CLI rather than use a
   libgit2 binding. The CLI is the source of truth users already trust, and it
   avoids subtle divergences (e.g. `merge-base`, worktree, reflog behavior).
   This choice is stack-independent but is cleaner in Node where we are already
   process-oriented.
4. **Distribution.** `npm install -g branchit` is a low-friction path for the
   primary audience (developers who already have Node), and `tsup` produces a
   single ESM entry with a shebang.

### Trade-offs accepted

- **Startup cost.** Node has a higher fixed startup cost than a Rust binary. We
  mitigate: no automatic network on launch, render immediately from local state,
  batched Git calls (`for-each-ref`, `status --porcelain=v2`) instead of N+1
  subprocesses. A future path to a compiled/pkg binary remains open.
- **Runtime dependency.** Node must be present. Acceptable for the target user.

## Consequences

- Git is accessed only through a single safe executor (`src/git/client.ts`) that
  uses argument arrays with `shell: false`.
- The UI never constructs Git strings; commands are built in `src/git/command.ts`.
- Revisiting for a compiled binary later would not change the architecture's
  layering, only the executor/runtime.
