import { Box, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ConfirmAction, ConfirmModal } from "../components/ConfirmModal.js";
import { Spinner } from "../components/Spinner.js";
import { type Hint, StatusBar } from "../components/StatusBar.js";
import { Toast, type ToastState } from "../components/Toast.js";
import { defaultConfig, type ResolvedConfig } from "../config/schema.js";
import { markOnboarded } from "../config/state.js";
import { isTrusted, trustRepo } from "../config/trust.js";
import { type DeleteSpec, stagePaths, unstagePaths } from "../git/actions.js";
import { type FileDiff, hunkPatch, parseDiff } from "../git/diff.js";
import type { Branch, WorkingTreeState } from "../git/models.js";
import { type ReflogEntry, readReflog, reflogPreview } from "../git/recent.js";
import type { GitRepository } from "../git/repository.js";
import { listStashes, type StashEntry, stashCommands, stashPatch } from "../git/stash.js";
import { fetchRemote } from "../git/sync.js";
import {
  applyHunk,
  fileDiffText,
  type PullMode,
  pullConflictState,
  untrackedPreview,
  workspaceCommands,
} from "../git/workspace.js";
import { Journal, type JournalEntry } from "../journal/journal.js";
import { Recorder } from "../journal/record.js";
import { executeUndo, planUndo, readUndoContext, type UndoPlan } from "../journal/undo.js";
import { COMMANDS, type CommandId, commandByShortcut, shortcutFor } from "../keys/registry.js";
import { BranchSwitcher } from "../screens/BranchSwitcher.js";
import { CommandPalette } from "../screens/CommandPalette.js";
import { CommitFlow } from "../screens/CommitFlow.js";
import { Dashboard } from "../screens/Dashboard.js";
import { HelpOverlay } from "../screens/HelpOverlay.js";
import { NewBranch } from "../screens/NewBranch.js";
import { PrReadiness } from "../screens/PrReadiness.js";
import { RecoverScreen } from "../screens/RecoverScreen.js";
import { type SearchItem, SearchOverlay } from "../screens/SearchOverlay.js";
import { StashScreen } from "../screens/StashScreen.js";
import { Sweeper } from "../screens/Sweeper.js";
import { UndoScreen } from "../screens/UndoScreen.js";
import { Welcome } from "../screens/Welcome.js";
import { type FileRow, WorkingTree } from "../screens/WorkingTree.js";
import { Worktrees } from "../screens/Worktrees.js";
import { relativeTime, sanitizeForDisplay } from "../utils/format.js";
import { openUrl } from "../utils/open-url.js";
import { aiTrustKey, generateCommitMessage } from "../workflows/ai-commit.js";
import { commandsFromStrings, detectChecks, runChecks } from "../workflows/checks.js";
import { gatherPrReadiness, type PrContext } from "../workflows/pr.js";
import {
  gatherSweepCandidates,
  resolveSweepConfig,
  type SweepCandidate,
} from "../workflows/sweep.js";
import {
  gatherWorktrees,
  type WorktreeInfo,
  worktreeCommands,
  worktreePathFor,
} from "../workflows/worktrees.js";
import { toastForError } from "./error-text.js";
import { loadRepoData, type RepoData } from "./loadRepo.js";

type View =
  | "dashboard"
  | "switcher"
  | "newBranch"
  | "palette"
  | "help"
  | "sweeper"
  | "commit"
  | "pr"
  | "undo"
  | "recover"
  | "workingTree"
  | "search"
  | "stash"
  | "worktrees"
  | "worktreeBranch"
  | "worktreeNew"
  | "welcome";

interface ModalState {
  title: string;
  lines: string[];
  commandPreview?: string[];
  actions: ConfirmAction[];
  danger?: boolean;
  onAction: (key: string) => void;
}

const IMPLEMENTED_COMMANDS: ReadonlySet<CommandId> = new Set([
  "dashboard.switchBranch",
  "dashboard.newBranch",
  "dashboard.fetch",
  "dashboard.sweep",
  "dashboard.commit",
  "dashboard.prepare",
  "global.undo",
  "global.recover",
  "global.search",
  "dashboard.workingTree",
  "dashboard.sync",
  "dashboard.stash",
  "dashboard.worktrees",
  "global.refresh",
  "global.help",
  "global.quit",
]);

export function App(props: {
  git: GitRepository;
  initial: RepoData;
  commandPreview: boolean;
  /** Resolved config; defaults are used when omitted (e.g. in tests). */
  config?: ResolvedConfig;
  /** Show the one-time welcome screen before the dashboard. */
  firstRun?: boolean;
  /**
   * Ask the launching shell to cd somewhere after exit (via `branchit
   * shell-init`). Returns false when no shell integration is active.
   */
  cdTo?: (path: string) => boolean;
}) {
  const { git } = props;
  const config = props.config ?? defaultConfig();
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = Math.min(100, Math.max(50, (stdout?.columns ?? 80)));

  const [data, setData] = useState<RepoData>(props.initial);
  const [view, setView] = useState<View>(props.firstRun ? "welcome" : "dashboard");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sweep, setSweep] = useState<{ base: string; candidates: SweepCandidate[] } | null>(null);
  const [commitWt, setCommitWt] = useState<WorkingTreeState | null>(null);
  const [prCtx, setPrCtx] = useState<PrContext | null>(null);
  const [undo, setUndo] = useState<{
    entry: JournalEntry | null;
    plan: UndoPlan | null;
    history: JournalEntry[];
  } | null>(null);
  const [reflog, setReflog] = useState<ReflogEntry[] | null>(null);
  const [wtRevision, setWtRevision] = useState(0);
  const [searchItems, setSearchItems] = useState<SearchItem[] | null>(null);
  const [stashes, setStashes] = useState<StashEntry[] | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[] | null>(null);

  // Every mutation goes through the recorder so it can be undone later.
  const journal = useMemo(() => Journal.forGitDir(git.gitDir), [git.gitDir]);
  const rec = useMemo(() => new Recorder(git, journal), [git, journal]);
  // Lets search (defined before runCommand) run commands without a cycle.
  const runCommandRef = useRef<((id: CommandId) => void) | null>(null);

  // Pre-commit checks: explicit config commands take precedence; otherwise they
  // are detected from the repo manifest. Advisory only — never run without
  // explicit trust.
  const checks = useMemo(
    () =>
      config.checks.commands
        ? commandsFromStrings(config.checks.commands)
        : detectChecks(git.root),
    [config.checks.commands, git.root],
  );
  const checkDisplays = useMemo(() => checks.map((c) => c.display), [checks]);
  const [checksTrusted, setChecksTrusted] = useState(() =>
    isTrusted(git.root, checkDisplays),
  );

  // Auto-dismiss transient toasts (errors persist a little longer).
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" ? 6000 : 2500;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast]);

  const dataRef = useRef(data);
  dataRef.current = data;

  /** Re-read the repository. A failed refresh keeps the last snapshot and says so. */
  const reload = useCallback(async () => {
    try {
      const fresh = await loadRepoData(git);
      setData(fresh);
      return fresh;
    } catch (e) {
      setToast({
        kind: "error",
        message: `Could not refresh: ${e instanceof Error ? e.message : String(e)}`,
      });
      return dataRef.current;
    }
  }, [git]);

  const notify = useCallback((t: ToastState) => setToast(t), []);

  // ── Branch switching orchestration ────────────────────────────────────────
  const doLocalSwitch = useCallback(
    async (name: string) => {
      setBusy(`Switching to ${name}…`);
      const res = await rec.switchBranch(name);
      setBusy(null);
      if (res.ok) {
        await reload();
        setView("dashboard");
        notify({ kind: "success", message: `Switched to ${name}` });
        return;
      }
      if (res.error.kind === "dirty_worktree") {
        // Offer an explicit stash — never stash silently.
        setModal({
          title: "Branch switch blocked by local changes",
          lines: [
            `Switching to ${name} would overwrite uncommitted changes.`,
            "Branchit can stash them (including untracked files) first.",
          ],
          commandPreview: [
            `git stash push --include-untracked --message "branchit: switch to ${name}"`,
            `git switch ${name}`,
          ],
          actions: [
            { key: "s", label: "Stash & switch", tone: "primary" },
            { key: "v", label: "Keep here (cancel)", tone: "default" },
          ],
          onAction: async (key) => {
            setModal(null);
            if (key !== "s") return;
            setBusy("Stashing changes…");
            const sw = await rec.stashAndSwitch(name, `branchit: switch to ${name}`);
            if (!sw.ok && sw.stage === "stash") {
              setBusy(null);
              const t = toastForError(sw.result.error);
              notify({ kind: "error", message: t.message, detail: t.detail });
              return;
            }
            setBusy(null);
            await reload();
            if (sw.ok) {
              setView("dashboard");
              notify({
                kind: "success",
                message: `Stashed changes and switched to ${name}`,
              });
            } else {
              // Partial completion: stash succeeded, switch failed. Be honest.
              const t = toastForError(sw.result.error);
              notify({
                kind: "error",
                message: `Stashed, but switch failed: ${t.message}. Your changes are safe in the stash.`,
              });
            }
          },
        });
        return;
      }
      const t = toastForError(res.error);
      notify({ kind: "error", message: t.message, detail: t.detail });
    },
    [notify, rec, reload],
  );

  /** Leave the TUI in `path` if the shell wrapper is installed; otherwise say how. */
  const openHere = useCallback(
    (path: string) => {
      if (props.cdTo?.(path)) {
        exit();
        return;
      }
      setModal({
        title: "Open in your shell",
        lines: [
          "A program cannot change its parent shell's directory. Run:",
          `  cd ${path}`,
          "",
          "To make Enter do this for you, add to your shell rc:",
          '  eval "$(branchit shell-init zsh)"   # or bash / fish',
        ],
        actions: [{ key: "enter", label: "OK" }],
        onAction: () => setModal(null),
      });
    },
    [exit, props.cdTo],
  );

  const onSelectBranch = useCallback(
    (branch: Branch) => {
      if (branch.isCurrent) {
        notify({ kind: "info", message: `Already on ${branch.name}` });
        setView("dashboard");
        return;
      }
      if (branch.worktreePath) {
        const path = branch.worktreePath;
        setModal({
          title: `${branch.name} is checked out in another worktree`,
          lines: [path, "Git allows a branch in only one worktree at a time."],
          actions: [{ key: "enter", label: "Open that worktree", tone: "primary" }],
          onAction: (key) => {
            setModal(null);
            if (key === "enter") openHere(path);
          },
        });
        return;
      }
      if (branch.kind === "remote") {
        // Derive the local name by stripping the remote prefix.
        const slash = branch.name.indexOf("/");
        const localName = slash === -1 ? branch.name : branch.name.slice(slash + 1);
        const existingLocal = data.branches.find(
          (b) => b.kind === "local" && b.name === localName,
        );
        if (existingLocal) {
          void doLocalSwitch(localName);
          return;
        }
        setModal({
          title: "Create local tracking branch?",
          lines: [
            `Local branch:  ${localName}`,
            `Tracks:        ${branch.name}`,
          ],
          commandPreview: [`git switch --create ${localName} --track ${branch.name}`],
          actions: [{ key: "enter", label: "Create & switch", tone: "primary" }],
          onAction: async () => {
            setModal(null);
            setBusy(`Creating ${localName}…`);
            const res = await rec.switchTrackNew(localName, branch.name);
            setBusy(null);
            if (res.ok) {
              await reload();
              setView("dashboard");
              notify({ kind: "success", message: `Switched to ${localName}` });
            } else {
              const t = toastForError(res.error);
              notify({ kind: "error", message: t.message, detail: t.detail });
            }
          },
        });
        return;
      }
      void doLocalSwitch(branch.name);
    },
    [data.branches, doLocalSwitch, notify, openHere, rec, reload],
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const onFetch = useCallback(async () => {
    const remote = data.state.remotes[0];
    if (!remote) {
      notify({ kind: "warning", message: "No remote configured" });
      return;
    }
    setBusy(`Fetching ${remote.name}…`);
    const res = await fetchRemote(git.client, remote.name, false);
    setBusy(null);
    if (res.ok) {
      await reload();
      notify({
        kind: "success",
        message: `Fetched ${remote.name} in ${(res.durationMs / 1000).toFixed(1)}s`,
      });
    } else {
      const t = toastForError(res.error);
      notify({ kind: "error", message: t.message, detail: t.detail });
    }
  }, [data.state.remotes, git, notify, reload]);

  const onCreateBranch = useCallback(
    async (name: string, base: string) => {
      setBusy(`Creating ${name}…`);
      const res = await rec.createBranch(name, base);
      setBusy(null);
      if (res.ok) {
        await reload();
        setView("dashboard");
        notify({ kind: "success", message: `Created and switched to ${name}` });
      } else {
        const t = toastForError(res.error);
        notify({ kind: "error", message: t.message, detail: t.detail });
      }
    },
    [notify, rec, reload],
  );

  // ── Sweeper ─────────────────────────────────────────────────────────────
  const openSweeper = useCallback(async () => {
    const sweepConfig = resolveSweepConfig(
      config.branches,
      data.state.defaultBranch,
      data.state.currentBranch,
    );
    if (!sweepConfig) {
      notify({
        kind: "warning",
        message: "Could not determine a base branch to sweep against",
      });
      return;
    }
    setBusy("Scanning branches…");
    const candidates = await gatherSweepCandidates(git.client, data.branches, sweepConfig);
    setBusy(null);
    setSweep({ base: sweepConfig.base, candidates });
    setView("sweeper");
  }, [
    config.branches,
    data.branches,
    data.state.currentBranch,
    data.state.defaultBranch,
    git,
    notify,
  ]);

  /** Undo a specific journal entry after re-validating it against the repo. */
  const runUndo = useCallback(
    async (entry: JournalEntry) => {
      setBusy("Undoing…");
      const plan = planUndo(entry, await readUndoContext(git));
      if (!plan.ok) {
        setBusy(null);
        notify({ kind: "warning", message: plan.reason });
        return;
      }
      const res = await executeUndo(git, journal, entry, plan);
      setBusy(null);
      await reload();
      setUndo(null);
      setView("dashboard");
      if (res.ok) {
        notify({ kind: "success", message: `Undone: ${plan.summary}` });
      } else {
        notify({
          kind: "error",
          message: `Undo stopped at ${res.failed?.command}: ${res.failed?.message}`,
          detail: res.ran.length ? `Already ran: ${res.ran.join("; ")}` : undefined,
        });
      }
    },
    [git, journal, notify, reload],
  );

  const openUndo = useCallback(async () => {
    const history = journal.history();
    const entry = history[0] ?? null;
    const plan = entry ? planUndo(entry, await readUndoContext(git)) : null;
    setUndo({ entry, plan, history });
    setView("undo");
  }, [git, journal]);

  const openRecover = useCallback(async () => {
    setBusy("Reading reflog…");
    const entries = await readReflog(git.client);
    setBusy(null);
    setReflog(entries);
    setView("recover");
  }, [git]);

  const onRecover = useCallback(
    (entry: ReflogEntry) => {
      const name = `recovered/${entry.sha.slice(0, 7)}`;
      setModal({
        title: "Restore as a new branch?",
        lines: [
          `Branch:  ${name}`,
          `Commit:  ${entry.sha.slice(0, 7)} ${entry.subject}`,
          "Nothing else changes; you stay on the current branch.",
        ],
        commandPreview: [`git branch ${name} ${entry.sha}`],
        actions: [{ key: "enter", label: "Create branch", tone: "primary" }],
        onAction: async (key) => {
          setModal(null);
          if (key !== "enter") return;
          const res = await rec.createBranchAt(name, entry.sha);
          if (res.ok) {
            await reload();
            setReflog(null);
            setView("dashboard");
            notify({ kind: "success", message: `Created ${name}` });
          } else {
            const t = toastForError(res.error);
            notify({ kind: "error", message: t.message, detail: t.detail });
          }
        },
      });
    },
    [notify, rec, reload],
  );

  const performDelete = useCallback(
    async (specs: DeleteSpec[]) => {
      setBusy(`Deleting ${specs.length} branch(es)…`);
      const { outcomes, entry } = await rec.deleteBranches(specs);
      setBusy(null);
      await reload();
      const deleted = outcomes.filter((o) => o.ok);
      const failed = outcomes.filter((o) => !o.ok);
      setView("dashboard");
      setSweep(null);

      const lines: string[] = [];
      if (deleted.length) lines.push(`Deleted: ${deleted.map((o) => o.name).join(", ")}`);
      for (const f of failed)
        lines.push(`Kept ${f.name} — ${f.error?.message ?? "could not delete"}`);

      // Result modal offers undo for the branches that were actually deleted.
      const canUndo = entry !== null;
      setModal({
        title:
          failed.length === 0
            ? `Deleted ${deleted.length} branch(es)`
            : `Deleted ${deleted.length}, kept ${failed.length}`,
        lines: lines.length ? lines : ["No branches were deleted."],
        danger: false,
        actions: canUndo
          ? [
              { key: "u", label: "Undo", tone: "primary" },
              { key: "enter", label: "Done" },
            ]
          : [{ key: "enter", label: "Done" }],
        onAction: (key) => {
          setModal(null);
          if (key === "u" && entry) void runUndo(entry);
        },
      });
    },
    [rec, reload, runUndo],
  );

  const onSweepDelete = useCallback(
    (specs: DeleteSpec[]) => {
      const forceCount = specs.filter((s) => s.mode === "force").length;
      const preview = specs.flatMap((s) => [
        ...(s.worktreePath ? [`git worktree remove ${s.worktreePath}`] : []),
        `git branch -${s.mode === "safe" ? "d" : "D"} ${s.name}`,
      ]);
      setModal({
        title: `Delete ${specs.length} branch(es)?`,
        lines: [
          ...specs.map((s) => `  ${s.mode === "force" ? "!" : "·"} ${s.name}`),
          forceCount > 0
            ? `${forceCount} use force delete (-D) — they are not fully merged.`
            : "All use Git's safe -d (merged) deletion.",
        ],
        commandPreview: preview.slice(0, 8),
        danger: forceCount > 0,
        actions: [{ key: "enter", label: "Delete", tone: forceCount > 0 ? "danger" : "primary" }],
        onAction: (key) => {
          setModal(null);
          if (key === "enter") void performDelete(specs);
        },
      });
    },
    [performDelete],
  );

  // ── Commit ──────────────────────────────────────────────────────────────
  const openCommit = useCallback(() => {
    const wt = data.status.workingTree;
    if (wt.isClean) {
      notify({ kind: "info", message: "Nothing to commit — working tree is clean" });
      return;
    }
    setCommitWt(wt);
    setView("commit");
  }, [data.status.workingTree, notify]);

  const onReconcileStaging = useCallback(
    async (toAdd: string[], toRemove: string[]) => {
      if (toRemove.length) await unstagePaths(git.client, toRemove);
      if (toAdd.length) await stagePaths(git.client, toAdd);
      const fresh = await reload();
      setCommitWt(fresh.status.workingTree);
    },
    [git, reload],
  );

  const onCommit = useCallback(
    async (message: string) => {
      const res = await rec.commit(message);
      if (res.ok) await reload();
      return res;
    },
    [rec, reload],
  );

  // ── Optional AI commit message ([ai] command) ─────────────────────────────
  const aiProps = useMemo(() => {
    const command = config.ai.command;
    if (!command) return undefined;
    return {
      command,
      trusted: isTrusted(aiTrustKey(git.root), [command]),
      onTrust: () => trustRepo(aiTrustKey(git.root), [command]),
      suggest: async () => {
        const diff = await git.client.run({
          args: ["diff", "--cached", "--no-color", "--no-ext-diff"],
          display: "git diff --cached",
        });
        if (!diff.ok || !diff.stdout.trim()) {
          return { ok: false as const, error: "Nothing staged to describe." };
        }
        return generateCommitMessage(git.root, command, diff.stdout);
      },
    };
  }, [config.ai.command, git]);

  // ── PR readiness ──────────────────────────────────────────────────────────
  const openPr = useCallback(async () => {
    if (data.state.isDetached || !data.state.currentBranch) {
      notify({ kind: "warning", message: "Detached HEAD — check out a branch first" });
      return;
    }
    const base = config.branches.defaultBase ?? data.state.defaultBranch;
    if (!base) {
      notify({ kind: "warning", message: "Could not determine a base branch" });
      return;
    }
    const current = data.branches.find((b) => b.kind === "local" && b.isCurrent);
    setBusy("Checking PR readiness…");
    const ctx = await gatherPrReadiness(git.client, data.state, current?.upstream ?? null, base);
    setBusy(null);
    setPrCtx(ctx);
    setView("pr");
  }, [config.branches.defaultBase, data.branches, data.state, git, notify]);

  const onPush = useCallback(async () => {
    const ctx = prCtx;
    if (!ctx?.pushRemote) {
      notify({ kind: "warning", message: "No remote to push to" });
      return;
    }
    setBusy("Pushing…");
    const res = await rec.push({
      hasUpstream: ctx.readiness.hasUpstream,
      remote: ctx.pushRemote,
      branch: ctx.readiness.head,
    });
    setBusy(null);
    if (!res.ok) {
      const t = toastForError(res.error);
      notify({ kind: "error", message: t.message, detail: t.detail });
      return;
    }
    notify({ kind: "success", message: `Pushed ${ctx.readiness.head}` });
    // Re-gather so the checklist reflects the push.
    const fresh = await reload();
    const base = fresh.state.defaultBranch ?? ctx.readiness.base;
    const current = fresh.branches.find((b) => b.kind === "local" && b.isCurrent);
    const next = await gatherPrReadiness(git.client, fresh.state, current?.upstream ?? null, base);
    setPrCtx(next);
  }, [git, notify, prCtx, rec, reload]);

  const onOpenUrl = useCallback(
    async (url: string) => {
      const ok = await openUrl(url);
      notify(
        ok
          ? { kind: "info", message: "Opened compare page in browser" }
          : { kind: "warning", message: "Could not open a browser" },
      );
    },
    [notify],
  );

  // ── Working tree (w) ─────────────────────────────────────────────────────
  const loadWtDiff = useCallback(
    async (row: FileRow) => {
      if (row.kind === "untracked") {
        return { file: null, untracked: await untrackedPreview(git.root, row.path) };
      }
      const text = await fileDiffText(git.client, row.path, row.kind === "staged");
      return { file: parseDiff(text)[0] ?? null };
    },
    [git],
  );

  const afterWtChange = useCallback(async () => {
    await reload();
    setWtRevision((n) => n + 1);
  }, [reload]);

  const onWtToggle = useCallback(
    async (row: FileRow) => {
      const res =
        row.kind === "staged"
          ? await unstagePaths(git.client, [row.path])
          : await stagePaths(git.client, [row.path]);
      if (!res.ok) {
        const t = toastForError(res.error);
        notify({ kind: "error", message: t.message, detail: t.detail });
      }
      await afterWtChange();
    },
    [afterWtChange, git, notify],
  );

  const onWtHunk = useCallback(
    async (row: FileRow, file: FileDiff, index: number) => {
      const res = await applyHunk(
        git.client,
        hunkPatch(file, index),
        row.kind === "staged" ? "unstage" : "stage",
      );
      if (!res.ok) {
        const t = toastForError(res.error);
        notify({ kind: "error", message: `Could not apply hunk: ${t.message}`, detail: t.detail });
      }
      await afterWtChange();
    },
    [afterWtChange, git, notify],
  );

  const onWtDiscard = useCallback(
    (row: FileRow) => {
      setModal({
        title: `Discard changes to ${row.path}?`,
        lines: [
          row.kind === "untracked"
            ? "The untracked file is removed from the working tree."
            : "Working-tree changes to this file are removed.",
          "They are stashed first, so u on the dashboard (or branchit undo) brings them back.",
        ],
        commandPreview: [
          workspaceCommands.stashPaths(`branchit: discard ${row.path}`, [row.path]).display,
        ],
        danger: true,
        actions: [{ key: "enter", label: "Discard", tone: "danger" }],
        onAction: async (key) => {
          setModal(null);
          if (key !== "enter") return;
          const res = await rec.discard([row.path]);
          if (res.ok) notify({ kind: "success", message: `Discarded ${row.path} (u to undo)` });
          else {
            const t = toastForError(res.error);
            notify({ kind: "error", message: t.message, detail: t.detail });
          }
          await afterWtChange();
        },
      });
    },
    [afterWtChange, notify, rec],
  );

  // ── Sync (y) ─────────────────────────────────────────────────────────────
  const runPull = useCallback(
    async (mode: PullMode) => {
      setBusy("Pulling…");
      const res = await rec.pull(mode);
      if (res.ok) {
        setBusy(null);
        await reload();
        notify({ kind: "success", message: `Pulled (${mode}) — u to undo` });
        return;
      }
      const conflict = await pullConflictState(git);
      setBusy(null);
      await reload();
      if (!conflict) {
        const t = toastForError(res.error);
        notify({
          kind: "error",
          message: mode === "ff-only" ? `${t.message} — try merge or rebase` : t.message,
          detail: t.detail,
        });
        return;
      }
      setModal({
        title: `Pull stopped: ${conflict.files.length} conflicted file(s)`,
        lines: [
          `A ${conflict.operation} is in progress. Conflicts in:`,
          ...conflict.files.slice(0, 8).map((f) => `  ${f}`),
          "Abort to return exactly to where you were, or keep it and resolve in your editor.",
        ],
        commandPreview: [conflict.abort.display],
        danger: true,
        actions: [
          { key: "a", label: "Abort (back to before)", tone: "primary" },
          { key: "k", label: "Keep and resolve myself" },
        ],
        onAction: async (key) => {
          setModal(null);
          if (key === "a") {
            const r = await git.client.run(conflict.abort);
            await reload();
            notify(
              r.ok
                ? { kind: "success", message: "Aborted; back where you started" }
                : { kind: "error", message: `Abort failed: ${r.error?.message ?? r.stderr}` },
            );
          } else {
            notify({
              kind: "info",
              message: `Resolve, git add the files, then git ${conflict.operation === "merge" ? "commit" : "rebase --continue"}`,
            });
          }
        },
      });
    },
    [git, notify, rec, reload],
  );

  const openSync = useCallback(() => {
    const current = data.branches.find((b) => b.kind === "local" && b.isCurrent);
    const up = current?.upstream;
    if (!current || !up || up.gone) {
      notify({
        kind: "warning",
        message: up?.gone ? "Upstream branch was deleted" : "No upstream to pull from — push first (p)",
      });
      return;
    }
    if (!data.status.workingTree.isClean) {
      notify({
        kind: "warning",
        message: "Pull needs a clean working tree: commit (c), stash (z) or discard (w) first",
      });
      return;
    }
    const diverged = up.ahead > 0 && up.behind > 0;
    setModal({
      title: `Pull ${up.ref} into ${current.name}`,
      lines: [
        `${up.behind} incoming, ${up.ahead} local commit(s) not on ${up.ref}.`,
        up.behind === 0
          ? "Already up to date with the last fetch (f fetches first)."
          : diverged
            ? "Histories diverged: fast-forward is impossible; choose merge or rebase."
            : "Fast-forward only is the safe default.",
      ],
      commandPreview: [
        workspaceCommands.pull("ff-only").display,
        workspaceCommands.pull("merge").display,
        workspaceCommands.pull("rebase").display,
      ],
      actions: [
        ...(diverged ? [] : [{ key: "f", label: "Fast-forward only", tone: "primary" as const }]),
        { key: "m", label: "Merge" },
        { key: "r", label: "Rebase" },
      ],
      onAction: (key) => {
        setModal(null);
        const mode: PullMode | null =
          key === "f" ? "ff-only" : key === "m" ? "merge" : key === "r" ? "rebase" : null;
        if (mode) void runPull(mode);
      },
    });
  }, [data.branches, data.status.workingTree.isClean, notify, runPull]);

  // ── Stash manager (z) ────────────────────────────────────────────────────
  const refreshStashes = useCallback(async () => {
    setStashes(await listStashes(git.client));
  }, [git]);

  const openStash = useCallback(async () => {
    await refreshStashes();
    setView("stash");
  }, [refreshStashes]);

  const loadStashPatch = useCallback((e: StashEntry) => stashPatch(git.client, e.ref), [git]);

  const runStashCommand = useCallback(
    async (command: { args: string[]; display: string }, success: string) => {
      setBusy(`${command.display}…`);
      const res = await git.client.run(command);
      setBusy(null);
      await reload();
      await refreshStashes();
      if (res.ok) notify({ kind: "success", message: success });
      else {
        const t = toastForError(res.error!);
        notify({ kind: "error", message: t.message, detail: t.detail });
      }
    },
    [git, notify, refreshStashes, reload],
  );

  const onStashDrop = useCallback(
    (e: StashEntry) => {
      setModal({
        title: `Drop ${e.ref}?`,
        lines: [e.message, "u on the dashboard (or branchit undo) can store it back."],
        commandPreview: [stashCommands.drop(e.ref).display],
        danger: true,
        actions: [{ key: "enter", label: "Drop", tone: "danger" }],
        onAction: async (key) => {
          setModal(null);
          if (key !== "enter") return;
          const res = await rec.stashDrop(e);
          await refreshStashes();
          notify(
            res.ok
              ? { kind: "success", message: `Dropped ${e.ref} (u to undo)` }
              : { kind: "error", message: toastForError(res.error).message },
          );
        },
      });
    },
    [notify, rec, refreshStashes],
  );

  const onStashBranch = useCallback(
    (e: StashEntry) => {
      const name = `stash/${e.sha.slice(0, 7)}`;
      setModal({
        title: "Turn this stash into a branch?",
        lines: [
          `Branch ${name} is created at the commit the stash was made on,`,
          "the stash is applied there, then dropped.",
        ],
        commandPreview: [stashCommands.branch(name, e.ref).display],
        actions: [{ key: "enter", label: "Create branch", tone: "primary" }],
        onAction: async (key) => {
          setModal(null);
          if (key !== "enter") return;
          const res = await rec.stashBranch(name, e);
          await reload();
          await refreshStashes();
          if (res.ok) {
            setView("dashboard");
            notify({ kind: "success", message: `Switched to ${name} with the stash applied` });
          } else {
            const t = toastForError(res.error);
            notify({ kind: "error", message: t.message, detail: t.detail });
          }
        },
      });
    },
    [notify, rec, refreshStashes, reload],
  );

  // ── Global search (/) ────────────────────────────────────────────────────
  const openSearch = useCallback(async () => {
    setBusy("Indexing…");
    const [log, files] = await Promise.all([
      git.client.run({
        args: ["log", "-n", "300", "--format=%H%x1f%h%x1f%s%x1f%cI"],
        display: "git log -n 300",
      }),
      git.client.run({ args: ["ls-files", "-z"], display: "git ls-files" }),
    ]);
    setBusy(null);
    const items: SearchItem[] = [];
    for (const b of data.branches) {
      items.push({
        kind: "branch",
        name: b.name,
        value: b.fullRef,
        detail: b.kind === "remote" ? "remote" : b.isCurrent ? "current" : undefined,
        recencyRank: data.recentRanks.get(b.name),
      });
    }
    for (const c of COMMANDS) {
      if (!IMPLEMENTED_COMMANDS.has(c.id) || c.id === "global.search") continue;
      items.push({ kind: "command", name: c.title, value: c.id, detail: shortcutFor(c.id) });
    }
    if (log.ok) {
      for (const line of log.stdout.split("\n")) {
        const [sha, short, subject, at] = line.split("\x1f");
        if (sha && subject) {
          items.push({ kind: "commit", name: subject, value: sha, detail: `${short} ${relativeTime(at ?? "")}` });
        }
      }
    }
    if (files.ok) {
      for (const f of files.stdout.split("\0").slice(0, 20000)) {
        if (f) items.push({ kind: "file", name: f, value: f });
      }
    }
    setSearchItems(items);
    setView("search");
  }, [data.branches, data.recentRanks, git]);

  const [wtFocusPath, setWtFocusPath] = useState<string | null>(null);

  const onSearchPick = useCallback(
    async (item: SearchItem) => {
      setSearchItems(null);
      setView("dashboard");
      if (item.kind === "branch") {
        const b = data.branches.find((x) => x.fullRef === item.value);
        if (b) onSelectBranch(b);
        return;
      }
      if (item.kind === "command") {
        runCommandRef.current?.(item.value as CommandId);
        return;
      }
      if (item.kind === "file") {
        const wt = data.status.workingTree;
        const changed = [...wt.staged, ...wt.unstaged, ...wt.untracked, ...wt.conflicted].some(
          (f) => f.path === item.value,
        );
        if (changed) {
          setWtFocusPath(item.value);
          setView("workingTree");
          return;
        }
        const last = await git.client.run({
          args: ["log", "-1", "--format=%h %s%n%an · %ar", "--", item.value],
          display: `git log -1 -- ${item.value}`,
        });
        setModal({
          title: item.value,
          lines: ["No uncommitted changes.", ...(last.ok ? last.stdout.trim().split("\n") : [])],
          actions: [{ key: "enter", label: "Close" }],
          onAction: () => setModal(null),
        });
        return;
      }
      // Commit: show it and offer to restore it as a branch.
      const show = await git.client.run({
        args: ["show", "--stat", "--format=%h %s%n%an · %ar", "--no-color", item.value],
        display: `git show --stat ${item.value}`,
      });
      const name = `recovered/${item.value.slice(0, 7)}`;
      setModal({
        title: `Commit ${item.value.slice(0, 7)}`,
        lines: show.ok ? show.stdout.trim().split("\n").slice(0, 14) : [item.name],
        commandPreview: [`git branch ${name} ${item.value}`],
        actions: [
          { key: "b", label: "Branch from here" },
          { key: "enter", label: "Close" },
        ],
        onAction: async (key) => {
          setModal(null);
          if (key !== "b") return;
          const res = await rec.createBranchAt(name, item.value);
          await reload();
          notify(
            res.ok
              ? { kind: "success", message: `Created ${name}` }
              : { kind: "error", message: toastForError(res.error).message },
          );
        },
      });
    },
    [data.branches, data.status.workingTree, git, notify, onSelectBranch, rec, reload],
  );

  // ── Worktrees (t) ────────────────────────────────────────────────────────
  const refreshWorktrees = useCallback(async () => {
    const list = await gatherWorktrees(git);
    setWorktrees(list);
    return list;
  }, [git]);

  const openWorktrees = useCallback(async () => {
    setBusy("Reading worktrees…");
    await refreshWorktrees();
    setBusy(null);
    setView("worktrees");
  }, [refreshWorktrees]);

  const addWorktree = useCallback(
    (branch: string, newBranchFrom?: string) => {
      const path = worktreePathFor(config.worktrees.root, git.root, branch);
      const command = newBranchFrom
        ? worktreeCommands.addNew(path, branch, newBranchFrom)
        : worktreeCommands.addExisting(path, branch);
      setModal({
        title: `Add worktree for ${branch}?`,
        lines: [`Location: ${path}`, "Change the location with [worktrees] root in .branchit.toml."],
        commandPreview: [command.display],
        actions: [
          { key: "enter", label: "Add", tone: "primary" },
          { key: "o", label: "Add and open here" },
        ],
        onAction: async (key) => {
          setModal(null);
          setBusy("Adding worktree…");
          const res = await rec.addWorktree(path, branch, newBranchFrom ? { newBranchFrom } : {});
          setBusy(null);
          await reload();
          if (!res.ok) {
            const t = toastForError(res.error);
            notify({ kind: "error", message: t.message, detail: t.detail });
            setView("worktrees");
            return;
          }
          await refreshWorktrees();
          setView("worktrees");
          notify({ kind: "success", message: `Added worktree for ${branch} (u to undo)` });
          if (key === "o") openHere(path);
        },
      });
    },
    [config.worktrees.root, git.root, notify, openHere, rec, refreshWorktrees, reload],
  );

  const onWorktreeBranchPicked = useCallback(
    (branch: Branch) => {
      if (branch.isCurrent || branch.worktreePath) {
        notify({ kind: "warning", message: `${branch.name} is already checked out` });
        return;
      }
      if (branch.kind === "remote") {
        const slash = branch.name.indexOf("/");
        const local = slash === -1 ? branch.name : branch.name.slice(slash + 1);
        const exists = data.branches.some((b) => b.kind === "local" && b.name === local);
        if (exists) addWorktree(local);
        else addWorktree(local, branch.name);
        return;
      }
      addWorktree(branch.name);
    },
    [addWorktree, data.branches, notify],
  );

  const onRemoveWorktree = useCallback(
    (wt: WorktreeInfo) => {
      const dirty = (wt.dirtyCount ?? 0) > 0;
      setModal({
        title: `Remove worktree ${wt.branch ?? wt.path}?`,
        lines: dirty
          ? [
              `It has ${wt.dirtyCount} uncommitted change(s).`,
              "Git refuses a normal removal. Force removal deletes those changes permanently.",
            ]
          : [`The directory ${wt.path} is removed; the branch stays.`, "u on the dashboard can undo this."],
        commandPreview: [worktreeCommands.remove(wt.path, dirty).display],
        danger: dirty,
        actions: dirty
          ? [{ key: "F", label: "Force remove (permanent)", tone: "danger" }]
          : [{ key: "enter", label: "Remove", tone: "primary" }],
        onAction: async (key) => {
          setModal(null);
          if (key !== "enter" && key !== "F") return;
          const res = await rec.removeWorktree(wt, dirty);
          await refreshWorktrees();
          await reload();
          if (res.ok) notify({ kind: "success", message: `Removed ${wt.path}` });
          else {
            const t = toastForError(res.error);
            notify({ kind: "error", message: t.message, detail: t.detail });
          }
        },
      });
    },
    [notify, rec, refreshWorktrees, reload],
  );

  const onPruneWorktrees = useCallback(() => {
    setModal({
      title: "Prune stale worktrees?",
      lines: ["Removes Git's records of worktrees whose directories no longer exist."],
      commandPreview: [worktreeCommands.prune().display],
      actions: [{ key: "enter", label: "Prune", tone: "primary" }],
      onAction: async (key) => {
        setModal(null);
        if (key !== "enter") return;
        const res = await git.client.run(worktreeCommands.prune());
        await refreshWorktrees();
        notify(
          res.ok
            ? { kind: "success", message: "Pruned stale worktrees" }
            : { kind: "error", message: res.error?.message ?? "Prune failed" },
        );
      },
    });
  }, [git, notify, refreshWorktrees]);

  const runCommand = useCallback(
    (id: CommandId) => {
      switch (id) {
        case "dashboard.switchBranch":
          setView("switcher");
          break;
        case "dashboard.newBranch":
          setView("newBranch");
          break;
        case "dashboard.fetch":
          void onFetch();
          break;
        case "dashboard.sweep":
          void openSweeper();
          break;
        case "dashboard.commit":
          openCommit();
          break;
        case "dashboard.prepare":
          void openPr();
          break;
        case "dashboard.workingTree":
          setWtFocusPath(null);
          setView("workingTree");
          break;
        case "dashboard.sync":
          openSync();
          break;
        case "dashboard.stash":
          void openStash();
          break;
        case "dashboard.worktrees":
          void openWorktrees();
          break;
        case "global.search":
          void openSearch();
          break;
        case "global.undo":
          void openUndo();
          break;
        case "global.recover":
          void openRecover();
          break;
        case "global.refresh":
          void reload().then(() =>
            notify({ kind: "info", message: "Refreshed" }),
          );
          break;
        case "global.help":
          setView("help");
          break;
        case "global.quit":
          exit();
          break;
        default:
          notify({
            kind: "info",
            message: `${id.split(".")[1]} is planned but not implemented yet`,
          });
      }
    },
    [
      exit,
      notify,
      onFetch,
      openSweeper,
      openCommit,
      openPr,
      openUndo,
      openRecover,
      openSync,
      openStash,
      openSearch,
      openWorktrees,
      reload,
    ],
  );
  runCommandRef.current = runCommand;

  const isAvailable = useCallback(
    (id: CommandId): { ok: boolean; reason?: string } => {
      if (id === "dashboard.fetch" && data.state.remotes.length === 0)
        return { ok: false, reason: "no remote configured" };
      if (!IMPLEMENTED_COMMANDS.has(id))
        return { ok: false, reason: "planned" };
      return { ok: true };
    },
    [data.state.remotes.length],
  );

  const loadReflogPreview = useCallback((sha: string) => reflogPreview(git.client, sha), [git]);

  // ── Global key handling (only when no modal/overlay owns input) ────────────
  const modalOpen = modal !== null;
  const overlayOwnsInput =
    view === "switcher" ||
    view === "newBranch" ||
    view === "palette" ||
    view === "help" ||
    modalOpen;

  useInput(
    (input, key) => {
      if (input === ":" || (key.ctrl && input === "k")) {
        setView("palette");
        return;
      }
      if (input === "?") {
        setView("help");
        return;
      }
      if (input === "q") {
        exit();
        return;
      }
      const cmd = commandByShortcut(input);
      if (cmd) runCommand(cmd.id);
    },
    { isActive: view === "dashboard" && !overlayOwnsInput && !busy },
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const hint = (id: CommandId, label: string): Hint[] => {
    const key = shortcutFor(id);
    return key ? [{ key, label }] : [];
  };
  const dashboardHints: Hint[] = [
    ...hint("dashboard.switchBranch", "switch"),
    ...hint("dashboard.newBranch", "new"),
    ...hint("dashboard.commit", "commit"),
    ...hint("dashboard.sweep", "sweep"),
    ...hint("global.undo", "undo"),
    ...hint("dashboard.workingTree", "files"),
    ...hint("dashboard.worktrees", "worktrees"),
    ...hint("global.search", "search"),
    { key: ":", label: "commands" },
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ];

  return (
    <Box flexDirection="column" width={width}>
      {view === "welcome" ? (
        <Welcome
          width={width}
          onStart={() => {
            markOnboarded();
            setView("dashboard");
          }}
        />
      ) : null}

      {view === "dashboard" ? <Dashboard data={data} width={width} /> : null}

      {view === "switcher" ? (
        <BranchSwitcher
          data={data}
          width={width}
          onSelect={onSelectBranch}
          onClose={() => setView("dashboard")}
          commandPreview={props.commandPreview}
        />
      ) : null}

      {view === "newBranch" ? (
        <NewBranch
          data={data}
          width={width}
          base={data.state.currentBranch ?? data.state.defaultBranch ?? "HEAD"}
          onCreate={onCreateBranch}
          onClose={() => setView("dashboard")}
          commandPreview={props.commandPreview}
        />
      ) : null}

      {view === "palette" ? (
        <CommandPalette
          width={width}
          isAvailable={isAvailable}
          onRun={(id) => {
            setView("dashboard");
            runCommand(id);
          }}
          onClose={() => setView("dashboard")}
        />
      ) : null}

      {view === "sweeper" && sweep ? (
        <Sweeper
          candidates={sweep.candidates}
          base={sweep.base}
          width={width}
          onDelete={onSweepDelete}
          onClose={() => {
            setSweep(null);
            setView("dashboard");
          }}
        />
      ) : null}

      {view === "commit" && commitWt ? (
        <CommitFlow
          workingTree={commitWt}
          width={width}
          commandPreview={props.commandPreview}
          commitConfig={config.commit}
          checks={checks}
          isChecksTrusted={checksTrusted}
          onReconcileStaging={onReconcileStaging}
          onCommit={onCommit}
          onPersistTrust={() => {
            trustRepo(git.root, checkDisplays);
            setChecksTrusted(true);
          }}
          ai={aiProps}
          onRunChecks={(onProgress, signal) =>
            runChecks(git.root, checks, onProgress, signal)
          }
          onDone={() => {
            setCommitWt(null);
            setView("dashboard");
            void reload();
          }}
        />
      ) : null}

      {view === "pr" && prCtx ? (
        <PrReadiness
          ctx={prCtx}
          width={width}
          commandPreview={props.commandPreview}
          onPush={onPush}
          onOpenUrl={onOpenUrl}
          onClose={() => {
            setPrCtx(null);
            setView("dashboard");
          }}
        />
      ) : null}

      {view === "undo" && undo ? (
        <UndoScreen
          entry={undo.entry}
          plan={undo.plan}
          history={undo.history}
          width={width}
          active={modal === null && !busy}
          onConfirm={() => {
            if (undo.entry) void runUndo(undo.entry);
          }}
          onClose={() => {
            setUndo(null);
            setView("dashboard");
          }}
        />
      ) : null}

      {view === "recover" && reflog ? (
        <RecoverScreen
          entries={reflog}
          width={width}
          loadPreview={loadReflogPreview}
          active={modal === null}
          onRestore={onRecover}
          onClose={() => {
            setReflog(null);
            setView("dashboard");
          }}
        />
      ) : null}

      {view === "workingTree" ? (
        <WorkingTree
          workingTree={data.status.workingTree}
          width={width}
          loadDiff={loadWtDiff}
          onToggle={(row) => void onWtToggle(row)}
          onHunk={(row, file, i) => void onWtHunk(row, file, i)}
          onDiscard={onWtDiscard}
          onClose={() => setView("dashboard")}
          active={modal === null && !busy}
          revision={wtRevision}
          initialPath={wtFocusPath}
        />
      ) : null}

      {view === "search" && searchItems ? (
        <SearchOverlay
          items={searchItems}
          width={width}
          onPick={(item) => void onSearchPick(item)}
          onClose={() => {
            setSearchItems(null);
            setView("dashboard");
          }}
          active={modal === null}
        />
      ) : null}

      {view === "stash" && stashes ? (
        <StashScreen
          stashes={stashes}
          width={width}
          loadPatch={loadStashPatch}
          onApply={(e) => void runStashCommand(stashCommands.apply(e.ref), `Applied ${e.ref}`)}
          onPop={(e) => void runStashCommand(stashCommands.pop(e.ref), `Popped ${e.ref}`)}
          onDrop={onStashDrop}
          onBranch={onStashBranch}
          onClose={() => {
            setStashes(null);
            setView("dashboard");
          }}
          active={modal === null && !busy}
        />
      ) : null}

      {view === "worktrees" && worktrees ? (
        <Worktrees
          worktrees={worktrees}
          width={width}
          onOpen={(wt) => openHere(wt.path)}
          onAddExisting={() => setView("worktreeBranch")}
          onAddNew={() => setView("worktreeNew")}
          onRemove={onRemoveWorktree}
          onPrune={onPruneWorktrees}
          onClose={() => {
            setWorktrees(null);
            setView("dashboard");
          }}
          active={modal === null && !busy}
        />
      ) : null}

      {view === "worktreeBranch" ? (
        <BranchSwitcher
          data={data}
          width={width}
          onSelect={onWorktreeBranchPicked}
          onClose={() => setView("worktrees")}
          commandPreview={false}
        />
      ) : null}

      {view === "worktreeNew" ? (
        <NewBranch
          data={data}
          width={width}
          base={data.state.currentBranch ?? data.state.defaultBranch ?? "HEAD"}
          onCreate={(name, base) => addWorktree(name, base)}
          onClose={() => setView("worktrees")}
          commandPreview={false}
        />
      ) : null}

      {view === "help" ? (
        <HelpOverlay
          width={width}
          context="dashboard"
          onClose={() => setView("dashboard")}
        />
      ) : null}

      {modal ? (
        <ConfirmModal
          title={modal.title}
          lines={modal.lines}
          commandPreview={modal.commandPreview}
          actions={modal.actions}
          danger={modal.danger}
          width={width}
          onAction={modal.onAction}
          onCancel={() => setModal(null)}
        />
      ) : null}

      {busy ? (
        <Box paddingX={1} marginTop={1}>
          <Spinner label={sanitizeForDisplay(busy)} />
        </Box>
      ) : null}

      {toast ? <Toast toast={toast} width={width} /> : null}

      {view === "dashboard" && !toast && !busy ? (
        <StatusBar hints={dashboardHints} width={width} />
      ) : null}
    </Box>
  );
}
