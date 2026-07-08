import React from "react";
import { render } from "ink";
import { detectRepository, GitRepository } from "./git/repository.js";
import { detectGitVersion } from "./git/client.js";
import { loadRepoData } from "./app/loadRepo.js";
import { App } from "./app/App.js";
import { NoRepo } from "./screens/NoRepo.js";
import { ThemeProvider } from "./app/theme-context.js";
import { resolveTheme } from "./theme/tokens.js";
import { runDoctor } from "./commands/doctor.js";
import { printPlainStatus } from "./commands/status.js";

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

const HELP = `branchy — Git flow without the command flow.

Usage:
  branchy                 Launch the interactive TUI in the current repository
  branchy status          Print repository status (add --plain for scripts)
  branchy doctor          Diagnose the environment
  branchy switch <name>   Switch to a branch non-interactively
  branchy version         Print the version

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
    process.stdout.write(VERSION + "\n");
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

  // Interactive TUI requires a TTY.
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "branchy is interactive and needs a TTY. Try `branchy status --plain`.\n",
    );
    process.exitCode = 1;
    return;
  }

  const data = await loadRepoData(git);
  const themeValue = resolveTheme({
    noColor: flags.has("no-color") || Boolean(process.env["NO_COLOR"]),
    ascii: flags.has("ascii") || process.env["TERM"] === "dumb",
  });

  const app = render(
    <ThemeProvider value={themeValue}>
      <App git={git} initial={data} commandPreview={!flags.has("no-preview")} />
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
    process.stderr.write("Usage: branchy switch <branch>\n");
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
    `branchy encountered an unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  if (process.env["BRANCHY_LOG"] === "debug" && err instanceof Error) {
    process.stderr.write((err.stack ?? "") + "\n");
  }
  process.exitCode = 1;
});

// Referenced to keep the import used even if version checks are added later.
void detectGitVersion;
