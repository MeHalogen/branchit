import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { GitRepository } from "../git/repository.js";
import type { Branch } from "../git/models.js";
import { loadRepoData, type RepoData } from "./loadRepo.js";
import {
  switchBranch,
  switchTrackNew,
  createBranch,
  stashBeforeSwitch,
} from "../git/actions.js";
import { fetchRemote } from "../git/sync.js";
import { toastForError } from "./error-text.js";
import { commandByShortcut, type CommandId } from "../keys/registry.js";
import { Dashboard } from "../screens/Dashboard.js";
import { BranchSwitcher } from "../screens/BranchSwitcher.js";
import { NewBranch } from "../screens/NewBranch.js";
import { CommandPalette } from "../screens/CommandPalette.js";
import { HelpOverlay } from "../screens/HelpOverlay.js";
import { ConfirmModal, type ConfirmAction } from "../components/ConfirmModal.js";
import { StatusBar, type Hint } from "../components/StatusBar.js";
import { Toast, type ToastState } from "../components/Toast.js";
import { useColor } from "./theme-context.js";
import { sanitizeForDisplay } from "../utils/format.js";

type View = "dashboard" | "switcher" | "newBranch" | "palette" | "help";

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
  "global.refresh",
  "global.help",
  "global.quit",
]);

export function App(props: {
  git: GitRepository;
  initial: RepoData;
  commandPreview: boolean;
}) {
  const { git } = props;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const color = useColor();
  const width = Math.min(100, Math.max(50, (stdout?.columns ?? 80)));

  const [data, setData] = useState<RepoData>(props.initial);
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Auto-dismiss transient toasts (errors persist a little longer).
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" ? 6000 : 2500;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    const fresh = await loadRepoData(git);
    setData(fresh);
    return fresh;
  }, [git]);

  const notify = useCallback((t: ToastState) => setToast(t), []);

  // ── Branch switching orchestration ────────────────────────────────────────
  const doLocalSwitch = useCallback(
    async (name: string) => {
      setBusy(`Switching to ${name}…`);
      const res = await switchBranch(git.client, name);
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
            "Branchy can stash them (including untracked files) first.",
          ],
          commandPreview: [
            `git stash push --include-untracked --message "branchy: switch to ${name}"`,
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
            const stashRes = await stashBeforeSwitch(
              git.client,
              `branchy: switch to ${name}`,
            );
            if (!stashRes.ok) {
              setBusy(null);
              const t = toastForError(stashRes.error);
              notify({ kind: "error", message: t.message, detail: t.detail });
              return;
            }
            const sw = await switchBranch(git.client, name);
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
              const t = toastForError(sw.error);
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
    [git, notify, reload],
  );

  const onSelectBranch = useCallback(
    (branch: Branch) => {
      if (branch.isCurrent) {
        notify({ kind: "info", message: `Already on ${branch.name}` });
        setView("dashboard");
        return;
      }
      if (branch.worktreePath) {
        notify({
          kind: "error",
          message: `${branch.name} is checked out in ${branch.worktreePath}`,
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
            const res = await switchTrackNew(git.client, localName, branch.name);
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
    [data.branches, doLocalSwitch, git, notify, reload],
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
      const res = await createBranch(git.client, name, base);
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
    [git, notify, reload],
  );

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
    [exit, notify, onFetch, reload],
  );

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
  const dashboardHints: Hint[] = [
    { key: "b", label: "switch" },
    { key: "n", label: "new" },
    { key: "f", label: "fetch" },
    { key: "c", label: "commit" },
    { key: "s", label: "sweep" },
    { key: ":", label: "commands" },
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ];

  return (
    <Box flexDirection="column" width={width}>
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
          <Text color={color("primary")}>{sanitizeForDisplay(busy)}</Text>
        </Box>
      ) : null}

      {toast ? <Toast toast={toast} width={width} /> : null}

      {view === "dashboard" && !toast && !busy ? (
        <StatusBar hints={dashboardHints} width={width} />
      ) : null}
    </Box>
  );
}
