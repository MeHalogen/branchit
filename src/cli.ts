/**
 * Command-line entry.
 *
 * Kept deliberately light: argument parsing and the non-interactive commands
 * load only what they need, and the Ink/React TUI is imported dynamically on
 * the interactive path. `branchit --version` should never pay for React.
 */
import { version as VERSION } from "../package.json";
import type { GitRepository } from "./git/repository.js";

interface ParsedArgs {
  command: string | null;
  flags: Set<string>;
  positional: string[];
}

const SHORT_FLAGS: Record<string, string> = { h: "help", v: "version", y: "yes", n: "dry-run" };

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positional: string[] = [];
  let command: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
    else if (/^-[a-z]$/.test(arg) && SHORT_FLAGS[arg.slice(1)])
      flags.add(SHORT_FLAGS[arg.slice(1)]!);
    else if (command === null) command = arg;
    else positional.push(arg);
  }
  return { command, flags, positional };
}

const HELP = `branchit — Git flow without the command flow.

Usage:
  branchit                       Launch the interactive TUI in the current repository
  branchit demo                  Open the TUI in a throwaway sandbox repository
  branchit sweep [--yes]         List merged/stale branches; --yes deletes the safely merged ones
  branchit branches              List local branches (--all includes remotes)
  branchit pr                    Pull-request readiness for the current branch
  branchit status                Print repository status (--plain for key=value)
  branchit switch <name>         Switch to a branch non-interactively
  branchit doctor                Diagnose the environment
  branchit config                Show resolved configuration and its sources
  branchit completions <shell>   Print completions for zsh, bash or fish
  branchit version               Print the version

Options:
  --json                  Machine-readable JSON (sweep, branches, pr, status)
  --dry-run, -n           Sweep: show what would be deleted (the default)
  --yes, -y               Sweep: delete the safely merged branches
  --no-color              Disable color output
  --ascii                 Use ASCII glyphs instead of Unicode
  --debug                 Print Git command timings to stderr
  --help, -h              Show this help
  --version, -v           Show the version

Interactive keys:
  b switch   n new   s sweep   c commit   p PR   f fetch   : commands   ? help   q quit
`;

async function main(): Promise<number> {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));
  const out = (s: string) => void process.stdout.write(s);
  const err = (s: string) => void process.stderr.write(s);

  if (flags.has("help") || command === "help") {
    out(HELP);
    return 0;
  }
  if (flags.has("version") || command === "version") {
    out(`${VERSION}\n`);
    return 0;
  }
  if (command === "completions") {
    const { completionScript } = await import("./commands/completions.js");
    const script = positional[0] ? completionScript(positional[0] as never) : null;
    if (!script) {
      err("Usage: branchit completions zsh|bash|fish\n");
      return 1;
    }
    out(script);
    return 0;
  }
  if (command === "doctor") {
    const { runDoctor } = await import("./commands/doctor.js");
    await runDoctor({ version: VERSION });
    return 0;
  }
  if (command === "demo") {
    const { createDemoRepo } = await import("./commands/demo.js");
    const dir = await createDemoRepo();
    err(`Demo repository: ${dir}\nNothing here touches your own repositories.\n`);
    if (!process.stdout.isTTY) {
      out(`${dir}\n`);
      return 0;
    }
    process.chdir(dir);
  } else if (command !== null && !KNOWN.has(command)) {
    err(`Unknown command: ${command}\nRun \`branchit --help\` for usage.\n`);
    return 1;
  }

  const { detectRepository, GitRepository } = await import("./git/repository.js");
  const cwd = process.cwd();
  const detect = await detectRepository(cwd);

  if (!detect.isRepo || !detect.root || !detect.gitDir) {
    if ((command !== null && command !== "demo") || !process.stdout.isTTY) {
      err("Not a Git repository.\n");
      return 1;
    }
    const { renderNoRepo } = await import("./tui.js");
    await renderNoRepo(cwd, flags);
    return 0;
  }

  const onDebug = flags.has("debug")
    ? (line: string) => process.stderr.write(`[git] ${line}\n`)
    : undefined;

  const git = new GitRepository({
    root: detect.root,
    gitDir: detect.gitDir,
    cwd,
    isBare: detect.isBare,
    onDebug,
  });

  const json = flags.has("json");
  const io = { out, err };

  if (command === "status") {
    const { printStatus } = await import("./commands/status.js");
    await printStatus(git, { plain: flags.has("plain"), json }, io);
    return 0;
  }
  if (command === "switch") return nonInteractiveSwitch(git, positional[0]);
  if (command === "branches") {
    const { runBranchesCommand } = await import("./commands/branches.js");
    return runBranchesCommand(git, { json, all: flags.has("all") }, io);
  }

  // Resolve configuration (defaults ← user ← repo). Invalid files are reported
  // but never fatal.
  const { formatIssues, loadConfig } = await import("./config/load.js");
  const loaded = loadConfig(git.root);
  if (loaded.issues.length > 0) {
    err("Branchit configuration problems:\n");
    err(`${formatIssues(loaded.issues)}\n`);
  }
  const cfg = loaded.config;

  if (command === "config") {
    const { printConfig } = await import("./commands/config.js");
    printConfig(loaded, git.root);
    return 0;
  }
  if (command === "sweep") {
    const { runSweepCommand } = await import("./commands/sweep.js");
    return runSweepCommand(git, cfg, { yes: flags.has("yes"), json }, io);
  }
  if (command === "pr") {
    const { runPrCommand } = await import("./commands/pr.js");
    return runPrCommand(git, cfg, { json }, io);
  }

  // Interactive TUI requires a TTY.
  if (!process.stdout.isTTY) {
    err("branchit is interactive and needs a TTY. Try `branchit status --plain`.\n");
    return 1;
  }
  const { launchTui } = await import("./tui.js");
  await launchTui(git, cfg, flags);
  return 0;
}

const KNOWN = new Set(["status", "switch", "branches", "config", "sweep", "pr", "demo"]);

async function nonInteractiveSwitch(git: GitRepository, name: string | undefined): Promise<number> {
  if (!name) {
    process.stderr.write("Usage: branchit switch <branch>\n");
    return 1;
  }
  const { switchBranch } = await import("./git/actions.js");
  const res = await switchBranch(git.client, name);
  if (res.ok) {
    process.stdout.write(`Switched to ${name}\n`);
    return 0;
  }
  process.stderr.write(`Could not switch: ${res.error.message}\n`);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    // Ink restores the terminal on unmount; for pre-render failures make sure we
    // exit cleanly with a readable message rather than a raw stack trace.
    process.stderr.write(
      `branchit encountered an unexpected error: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    if (process.env["BRANCHIT_LOG"] === "debug" && e instanceof Error) {
      process.stderr.write(`${e.stack ?? ""}\n`);
    }
    process.exitCode = 1;
  });
