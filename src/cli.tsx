
import { render } from "ink";
import { App } from "./app/App.js";
import { loadRepoData } from "./app/loadRepo.js";
import { ThemeProvider } from "./app/theme-context.js";
import { printConfig } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";
import { printPlainStatus } from "./commands/status.js";
import { formatIssues, loadConfig } from "./config/load.js";
import { hasOnboarded } from "./config/state.js";
import { detectGitVersion } from "./git/client.js";
import { detectRepository, GitRepository } from "./git/repository.js";
import { NoRepo } from "./screens/NoRepo.js";
import { resolveTheme } from "./theme/tokens.js";

const VERSION = "0.1.0";

interface ParsedArgs {
  command: string | null;
  flags: Set<string>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positional: string[] = [];
  let command: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
    else if (command === null) command = arg;
    else positional.push(arg);
  }
  return { command, flags, positional };
}

const HELP = `branchit — Git flow without the command flow.

Usage:
  branchit                 Launch the interactive TUI in the current repository
  branchit status          Print repository status (add --plain for scripts)
  branchit doctor          Diagnose the environment
  branchit config          Show resolved configuration and its sources
  branchit switch <name>   Switch to a branch non-interactively
  branchit version         Print the version

Options:
  --no-color              Disable color output
  --ascii                 Use ASCII glyphs instead of Unicode
  --debug                 Print Git command timings to stderr
  --plain                 Machine-readable output (with status)
  --help                  Show this help
  --version               Show the version

Interactive keys:
  b switch   n new   f fetch   r refresh   : commands   ? help   q quit
`;

async function main(): Promise<void> {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));

  if (flags.has("help") || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (flags.has("version") || command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "doctor") {
    await runDoctor({ version: VERSION });
    return;
  }

  const cwd = process.cwd();
  const detect = await detectRepository(cwd);

  if (!detect.isRepo || !detect.root || !detect.gitDir) {
    if (command === "status" || !process.stdout.isTTY) {
      process.stderr.write("Not a Git repository.\n");
      process.exitCode = 1;
      return;
    }
    renderNoRepo(cwd, flags);
    return;
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

  // Non-interactive subcommands.
  if (command === "status") {
    await printPlainStatus(git, { plain: flags.has("plain") });
    return;
  }
  if (command === "switch") {
    await nonInteractiveSwitch(git, positional[0]);
    return;
  }

  // Resolve configuration (defaults ← user ← repo). Invalid files are reported
  // but never fatal.
  const loaded = loadConfig(git.root);
  if (loaded.issues.length > 0) {
    process.stderr.write("Branchit configuration problems:\n");
    process.stderr.write(`${formatIssues(loaded.issues)}\n`);
  }
  const cfg = loaded.config;

  if (command === "config") {
    printConfig(loaded, git.root);
    return;
  }

  // Interactive TUI requires a TTY.
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "branchit is interactive and needs a TTY. Try `branchit status --plain`.\n",
    );
    process.exitCode = 1;
    return;
  }

  const data = await loadRepoData(git);
  // CLI flags override config; config overrides built-in defaults.
  const themeValue = resolveTheme({
    noColor:
      flags.has("no-color") ||
      Boolean(process.env["NO_COLOR"]) ||
      cfg.ui.theme === "none",
    ascii:
      flags.has("ascii") || process.env["TERM"] === "dumb" || !cfg.ui.icons,
  });
  const commandPreview = flags.has("no-preview") ? false : cfg.ui.commandPreview;

  const app = render(
    <ThemeProvider value={themeValue}>
      <App
        git={git}
        initial={data}
        commandPreview={commandPreview}
        config={cfg}
        firstRun={!hasOnboarded()}
      />
    </ThemeProvider>,
    { exitOnCtrlC: true },
  );
  await app.waitUntilExit();
}

function renderNoRepo(cwd: string, flags: Set<string>): void {
  const themeValue = resolveTheme({
    noColor: flags.has("no-color") || Boolean(process.env["NO_COLOR"]),
    ascii: flags.has("ascii"),
  });
  const app = render(
    <ThemeProvider value={themeValue}>
      <NoRepo cwd={cwd} width={Math.min(80, process.stdout.columns ?? 80)} />
    </ThemeProvider>,
  );
  void app.waitUntilExit();
}

async function nonInteractiveSwitch(
  git: GitRepository,
  name: string | undefined,
): Promise<void> {
  if (!name) {
    process.stderr.write("Usage: branchit switch <branch>\n");
    process.exitCode = 1;
    return;
  }
  const { switchBranch } = await import("./git/actions.js");
  const res = await switchBranch(git.client, name);
  if (res.ok) {
    process.stdout.write(`Switched to ${name}\n`);
  } else {
    process.stderr.write(`Could not switch: ${res.error.message}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // Ink restores the terminal on unmount; for pre-render failures make sure we
  // exit cleanly with a readable message rather than a raw stack trace.
  process.stderr.write(
    `branchit encountered an unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  if (process.env["BRANCHIT_LOG"] === "debug" && err instanceof Error) {
    process.stderr.write(`${err.stack ?? ""}\n`);
  }
  process.exitCode = 1;
});

// Referenced to keep the import used even if version checks are added later.
void detectGitVersion;
