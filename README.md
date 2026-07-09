# 🌿 branchit

[![npm version](https://img.shields.io/npm/v/branchit?color=a6e3e9&style=flat-square)](https://www.npmjs.com/package/branchit)
[![CI status](https://img.shields.io/github/actions/workflow/status/MeHalogen/branchit/ci.yml?color=89b4fa&label=CI&style=flat-square)](https://github.com/MeHalogen/branchit/actions)
[![license](https://img.shields.io/npm/l/branchit?color=cba6f7&style=flat-square)](LICENSE)
[![node version](https://img.shields.io/node/v/branchit?color=a6e3a1&style=flat-square)](package.json)

**Git flow without the command flow.**

A fast, safe, keyboard-first terminal UI for the Git you do every day — switch branches, clean stale branches, compose structured commits, and prepare pull requests with zero command archaeology.

![Branchit Demo](docs/demo.gif)

---

### 🚀 30-Second Demo Tour

Here is what you are seeing in the animated walkthrough above:

* **🌿 Fuzzy Switcher (`b`)**: Press `b`, type a few characters to filter local/remote branches, press `Tab` to inspect rich details (commits, author, dates, tracking), and press `Enter` to switch instantly.
* **📋 PR Readiness (`p`)**: Press `p` to inspect branch health against the base branch. Spot unpushed commits, and press `p` to push/set upstream. Watch the checklist turn green and render a clickable GitHub compare link.
* **🧹 Safe Sweeper with Undo (`s`)**: Press `s` to scan for stale local branches. Branches already merged are pre-selected for safe deletion. Press `d` to delete, and if you make a mistake, hit `u` to **Undo** and restore them instantly!
* **✍️ Guided Conventional Commits & Auto-Checks (`c`)**: Press `c` to trigger a stage-by-stage commit wizard: stage files (`Space`/`a`), select commit types (`feat`, `fix`), auto-complete scopes, and enter subjects. It automatically prompts and runs pre-commit checks (`lint`, `test`) with live status and commits on success.

```
╭──────────────────────────────────────────────────────────────────────────╮
│ branchit  payments-api                                          main ↑2    │
╰──────────────────────────────────────────────────────────────────────────╯

 Repository  main → origin/main   changes

 0 staged   1 modified   1 untracked

 Quick actions
 [b] Switch branch                     [c] Conventional commit
 [n] New branch                        [s] Sweep merged branches
 [f] Fetch remote                      [p] Prepare PR

 Recent branches
 ● main                                                         ↑2  1s
   fix/old-header                                       remote gone  1s
   feat/payment-retry                                            ↑1  1s
   experiment/cache                                     no upstream  1s

 • Suggested: Stage changes and commit  (press c)

 b switch  n new  f fetch  c commit  s sweep  : commands  ? help  q quit
```

> This is a **real rendered frame**, not a mockup.

---

## ⚡ Quick Start

### Installation

Install globally via `npm`:

```bash
npm install -g branchit
```

> [!NOTE]
> Requires **Node ≥ 18** and **Git ≥ 2.23** (for `git switch` support).

### Usage

Run the dashboard in any Git repository:

```bash
cd your-project-directory
branchit
```

* Press **`b`** to switch branches.
* Press **`n`** to create a branch from prefix + description.
* Press **`f`** to fetch remote refs, and **`r`** to force-refresh.
* Press **`:`** to open the fuzzy command palette, and **`?`** for inline help.

---

## 💡 Understanding Git Better with Branchit

Git is incredibly powerful, but its command-line feedback can be silent or confusing. Here is a simple guide to Git's core concepts, and how **Branchit** makes them visual and safe:

### 1. What is a Branch?
In Git, a **branch is just a lightweight pointer** to a specific commit. When you switch branches, Git silently swaps the files in your directory to match that commit.
* **The Git Way**: Running `git switch feature` updates files instantly, but you can't see what's on that branch until you're already there.
* **The Branchit Way**: Press `b` to open the switcher. As you navigate, Branchit shows a **pre-flight dashboard** for each branch: who wrote the last commit, when it was created, how many commits it is ahead or behind, and whether it has a remote counterpart. You see where you are jumping *before* you jump.

### 2. Staging vs. Committing
Think of staging as **packing a box**, and committing as **sealing and labeling it**:
* **Staging (`git add`)**: You pick which changes are ready to go.
* **Committing (`git commit`)**: You seal the box with a description of what is inside.
* **The Branchit Way**: Press `c` to commit. Branchit displays a live list of changed files. You press `Space` to stage/unstage them individually, or `a` to stage all. You see exactly what is going into the "box" in real-time, then follow structured prompts to write a clean Conventional Commit message.

### 3. Upstream and Pushing
When you collaborate, you work with a **Remote** (usually `origin`), which is just a copy of the repository hosted on a server like GitHub:
* **Upstream**: A setting that links your local branch (on your laptop) to a remote branch (on GitHub). If you don't set this, Git doesn't know where to send your code when you type `git push`.
* **The Branchit Way**: Press `p` to check PR readiness. Branchit runs diagnostics and shows you if your branch is missing an upstream connection or has unpushed commits. If it's missing, you press `p` to push, and Branchit automatically sets up the upstream tracking for you.

### 4. Merging and Branch Cleanups (Sweeping)
When a branch is merged into `main`, it is safe to delete. But standard Git doesn't clean them up automatically:
* **Safe Deletion (`git branch -d`)**: Only succeeds if Git detects that the branch's commits are already present in your base branch (e.g., `main`).
* **Force Deletion (`git branch -D`)**: Deletes the branch pointer even if the work is lost.
* **The Branchit Way**: Press `s` to sweep. Branchit runs an ancestry check, separating branches into "Safe to Delete" (fully merged) and "Needs Review" (unmerged). If you delete something by accident, Branchit offers a local **Undo** option that restores the pointer instantly, saving you from Git archaeology.

---

## 🛠️ Commands & Options

When you aren't in a TTY, `branchit` degrades gracefully to support scripts and diagnostics:

| Command | Description |
|---|---|
| `branchit` | Open the interactive TUI dashboard |
| `branchit status` | Print a concise human-readable repo status summary |
| `branchit status --plain` | Output flat `key=value` variables for scripting |
| `branchit switch <name>` | Non-interactively switch to a branch (fails safely on conflicts) |
| `branchit config` | View your resolved settings and where each setting came from |
| `branchit doctor` | Run env diagnostics (git version, platform, paths) for bug reports |
| `branchit --help` | Display CLI options and usage |

---

## 🔒 Safety First

Branchit acts as a transparent cockpit for Git:

> [!IMPORTANT]
> **No Shell Strings**: Every Git invocation uses argument arrays run with `shell: false`. Refs are explicitly guarded with `--` to prevent remote command injection.

> [!TIP]
> **No Silent Stashing**: Switching with a dirty tree always prompts you first, showing the exact Git command pipeline. Partial failures are reported transparently.

> [!WARNING]
> **Ancestry-Based Sweeping**: Branch deletion safety is determined by checking Git merge history, never by checking branch names, age, or creation dates.

---

## ⚙️ Configuration

Branchit loads settings from three places in order of precedence:
1. Built-in defaults
2. User configuration (`~/.config/branchit/config.toml`)
3. Repository configuration (`.branchit.toml`)

Invalid TOML files are reported precisely with `file:field — error` and skipped safely without crashing the TUI.

```toml
# .branchit.toml
[ui]
command_preview = true      # Show the underlying git command at the bottom of screens
theme = "default"           # "default" or "none" (black & white)
icons = true                # Enable Unicode glyphs (falls back to ASCII if false)

[branches]
default_base = "main"       # Base branch used for comparison and sweeper
protected = ["main", "release/*"] # Branches that can never be deleted

[commit]
scopes = ["cli", "git", "ui", "api"] # Auto-complete scope suggestions
max_subject_length = 72     # Enforce maximum subject character limit
require_scope = false       # Block committing if scope is empty

[checks]
# Pre-commit checks. Repo-defined commands require explicit trust before running.
# If omitted, Branchit auto-detects scripts from package.json.
commands = ["npm run typecheck", "npm test"]
```

See [`.branchit.example.toml`](.branchit.example.toml) for a fully documented configuration template.

---

## 🤝 Contributing & Docs

Check out our documentation for architectural design:

* [Architecture Overview](docs/architecture.md)
* [Git Safety Guarantees & Check Trust Model](docs/git-safety.md)
* [Testing Setup](docs/testing.md)
* [Project Progress Checklist](docs/progress.md)

---

## 📄 License

Licensed under the [MIT License](LICENSE).
