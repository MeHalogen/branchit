/**
 * Interactive entry. Loaded lazily by `cli.ts` so that `--version`, `--help`
 * and every non-interactive command start without paying for Ink + React.
 */
import { writeFileSync } from "node:fs";
import { render } from "ink";
import { App } from "./app/App.js";
import { loadRepoData } from "./app/loadRepo.js";
import { ThemeProvider } from "./app/theme-context.js";
import type { ResolvedConfig } from "./config/schema.js";
import { hasOnboarded } from "./config/state.js";
import type { GitRepository } from "./git/repository.js";
import { NoRepo } from "./screens/NoRepo.js";
import { resolveTheme } from "./theme/tokens.js";

export async function launchTui(
  git: GitRepository,
  cfg: ResolvedConfig,
  flags: Set<string>,
): Promise<void> {
  const { resolveKeymap, installKeymap } = await import("./keys/registry.js");
  const keymap = resolveKeymap(cfg.keys);
  if (keymap.errors.length) process.stderr.write(`${keymap.errors.join("\n")}\n`);
  installKeymap(keymap.shortcuts);

  const data = await loadRepoData(git);
  // CLI flags override config; config overrides built-in defaults.
  const themeValue = resolveTheme({
    noColor: flags.has("no-color") || Boolean(process.env["NO_COLOR"]),
    ascii: flags.has("ascii") || process.env["TERM"] === "dumb" || !cfg.ui.icons,
    name: cfg.ui.theme,
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
        cdTo={cdViaShellWrapper}
      />
    </ThemeProvider>,
    { exitOnCtrlC: true },
  );
  await app.waitUntilExit();
}

export async function renderNoRepo(cwd: string, flags: Set<string>): Promise<void> {
  const themeValue = resolveTheme({
    noColor: flags.has("no-color") || Boolean(process.env["NO_COLOR"]),
    ascii: flags.has("ascii"),
  });
  const app = render(
    <ThemeProvider value={themeValue}>
      <NoRepo cwd={cwd} width={Math.min(80, process.stdout.columns ?? 80)} />
    </ThemeProvider>,
  );
  await app.waitUntilExit();
}

/**
 * With `branchit shell-init` installed, the wrapper sets BRANCHIT_CD_FILE and
 * cds to whatever path we write there once we exit.
 */
function cdViaShellWrapper(path: string): boolean {
  const file = process.env["BRANCHIT_CD_FILE"];
  if (!file) return false;
  try {
    writeFileSync(file, path);
    return true;
  } catch {
    return false;
  }
}
