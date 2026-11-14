/**
 * Interactive entry. Loaded lazily by `cli.ts` so that `--version`, `--help`
 * and every non-interactive command start without paying for Ink + React.
 */
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
  const data = await loadRepoData(git);
  // CLI flags override config; config overrides built-in defaults.
  const themeValue = resolveTheme({
    noColor: flags.has("no-color") || Boolean(process.env["NO_COLOR"]) || cfg.ui.theme === "none",
    ascii: flags.has("ascii") || process.env["TERM"] === "dumb" || !cfg.ui.icons,
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
