/**
 * Load and resolve Branchit configuration.
 *
 * Layers (low → high precedence): defaults → user config → repo `.branchit.toml`.
 * CLI flags are applied by the caller on top of the result. A malformed or
 * invalid file never crashes Branchit: its problems are collected as `issues`
 * (with file + field + message) and that layer is skipped, so the app still
 * runs on the remaining valid config.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { configDir } from "./paths.js";
import { ConfigFileSchema, defaultConfig, mergeConfig, type ResolvedConfig } from "./schema.js";

export interface ConfigIssue {
  file: string;
  /** Dotted field path, e.g. "checks.mode". Empty for whole-file parse errors. */
  field: string;
  message: string;
}

export interface LoadedConfig {
  config: ResolvedConfig;
  issues: ConfigIssue[];
  /** Paths of the config files that were found and applied. */
  sources: string[];
}

export function userConfigPath(): string {
  return join(configDir(), "config.toml");
}

export function repoConfigPath(root: string): string {
  return join(root, ".branchit.toml");
}

/** Parse + validate one file, folding it onto `base`. Records issues. */
function applyFile(
  base: ResolvedConfig,
  path: string,
  issues: ConfigIssue[],
  sources: string[],
): ResolvedConfig {
  if (!existsSync(path)) return base;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    issues.push({ file: path, field: "", message: `could not read file: ${(e as Error).message}` });
    return base;
  }

  let data: unknown;
  try {
    data = parseToml(raw);
  } catch (e) {
    issues.push({ file: path, field: "", message: `invalid TOML: ${(e as Error).message}` });
    return base;
  }

  const parsed = ConfigFileSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        file: path,
        field: issue.path.join("."),
        message: issue.message,
      });
    }
    return base; // skip this layer entirely when invalid
  }

  sources.push(path);
  return mergeConfig(base, parsed.data);
}

export function loadConfig(root: string): LoadedConfig {
  const issues: ConfigIssue[] = [];
  const sources: string[] = [];
  let config = defaultConfig();
  config = applyFile(config, userConfigPath(), issues, sources);
  config = applyFile(config, repoConfigPath(root), issues, sources);
  return { config, issues, sources };
}

/** Format issues for terminal display (one line each). */
export function formatIssues(issues: ConfigIssue[]): string {
  return issues.map((i) => `  ${i.file}${i.field ? `:${i.field}` : ""} — ${i.message}`).join("\n");
}
