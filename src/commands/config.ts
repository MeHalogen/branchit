/**
 * `branchit config` — show the resolved configuration and where it came from.
 */
import type { LoadedConfig } from "../config/load.js";
import { userConfigPath, repoConfigPath } from "../config/load.js";

export function printConfig(loaded: LoadedConfig, root?: string): void {
  const { config, sources } = loaded;
  const lines: string[] = [];
  lines.push("branchit config (resolved)");
  lines.push("");
  lines.push("Sources (low → high precedence):");
  lines.push(`  defaults (built-in)`);
  lines.push(`  user:  ${userConfigPath()}`);
  if (root) lines.push(`  repo:  ${repoConfigPath(root)}`);
  if (sources.length) {
    lines.push("");
    lines.push(`Applied files: ${sources.join(", ")}`);
  }
  lines.push("");
  lines.push("[ui]");
  lines.push(`  command_preview = ${config.ui.commandPreview}`);
  lines.push(`  icons           = ${config.ui.icons}`);
  lines.push(`  theme           = ${config.ui.theme}`);
  lines.push("[branches]");
  lines.push(`  default_base    = ${config.branches.defaultBase ?? "(auto-detect)"}`);
  lines.push(`  protected       = ${config.branches.protected.join(", ")}`);
  lines.push("[commit]");
  lines.push(`  types           = ${config.commit.types.map((t) => t.name).join(", ")}`);
  lines.push(`  scopes          = ${config.commit.scopes.join(", ") || "(none)"}`);
  lines.push(`  max_subject_len = ${config.commit.maxSubjectLength}`);
  lines.push(`  require_scope   = ${config.commit.requireScope}`);
  lines.push("[checks]");
  lines.push(
    `  commands        = ${config.checks.commands ? config.checks.commands.join(", ") : "(auto-detect from package.json)"}`,
  );
  process.stdout.write(lines.join("\n") + "\n");
}
