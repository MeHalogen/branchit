# Understanding Git better with Branchit

Git is incredibly powerful, but its command-line feedback can be silent or confusing. Here is a simple guide to Git's core concepts, and how **Branchit** makes them visual and safe:

## 1. What is a Branch?

In Git, a **branch is just a lightweight pointer** to a specific commit. When you switch branches, Git silently swaps the files in your directory to match that commit.

- **The Git Way**: Running `git switch feature` updates files instantly, but you can't see what's on that branch until you're already there.
- **The Branchit Way**: Press `b` to open the switcher. As you navigate, Branchit shows a **pre-flight dashboard** for each branch: who wrote the last commit, when it was created, how many commits it is ahead or behind, and whether it has a remote counterpart. You see where you are jumping _before_ you jump.

## 2. Staging vs. Committing

Think of staging as **packing a box**, and committing as **sealing and labeling it**:

- **Staging (`git add`)**: You pick which changes are ready to go.
- **Committing (`git commit`)**: You seal the box with a description of what is inside.
- **The Branchit Way**: Press `c` to commit. Branchit displays a live list of changed files. You press `Space` to stage/unstage them individually, or `a` to stage all. You see exactly what is going into the "box" in real-time, then follow structured prompts to write a clean Conventional Commit message.

## 3. Upstream and Pushing

When you collaborate, you work with a **Remote** (usually `origin`), which is just a copy of the repository hosted on a server like GitHub:

- **Upstream**: A setting that links your local branch (on your laptop) to a remote branch (on GitHub). If you don't set this, Git doesn't know where to send your code when you type `git push`.
- **The Branchit Way**: Press `p` to check PR readiness. Branchit runs diagnostics and shows you if your branch is missing an upstream connection or has unpushed commits. If it's missing, you press `p` to push, and Branchit automatically sets up the upstream tracking for you.

## 4. Merging and Branch Cleanups (Sweeping)

When a branch is merged into `main`, it is safe to delete. But standard Git doesn't clean them up automatically:

- **Safe Deletion (`git branch -d`)**: Only succeeds if Git detects that the branch's commits are already present in your base branch (e.g., `main`).
- **Force Deletion (`git branch -D`)**: Deletes the branch pointer even if the work is lost.
- **The Branchit Way**: Press `s` to sweep. Branchit runs an ancestry check, separating branches into "Safe to Delete" (fully merged) and "Needs Review" (unmerged). If you delete something by accident, Branchit offers a local **Undo** option that restores the pointer instantly, saving you from Git archaeology.

## 5. Undo, and the reflog

Most Git "mistakes" are recoverable, but the recovery commands are different
for every situation (`git reset --soft`, `git stash pop`, `git branch <name>
<sha>`, `git reset --keep`…).

- **The Branchit Way**: every operation Branchit performs is written to an
  operation journal, so `u` (or `branchit undo`) shows the last one and the
  exact inverse commands before running them, and refuses when you have moved
  on since. For work lost outside Branchit, `:` → *Recover lost work* browses
  the reflog — every commit `HEAD` has recently pointed at — and restores one
  as a new branch.

## 6. Worktrees

A worktree is a second (or tenth) checkout of the same repository in another
directory, each on its own branch, sharing one object database. You can run
tests on one branch while editing another, or give each coding agent its own
directory without cloning.

- **The Branchit Way**: `t` lists every worktree with its dirty state and
  ahead/behind, adds one for any branch in a predictable place, and `enter`
  drops your shell into it (with `branchit shell-init`).

