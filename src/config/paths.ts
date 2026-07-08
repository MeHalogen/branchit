/**
 * Resolve Branchy's per-user config directory, cross-platform.
 *
 * Honors BRANCHY_CONFIG_DIR (used by tests and power users) first, then
 * XDG_CONFIG_HOME, then platform conventions.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  const override = process.env["BRANCHY_CONFIG_DIR"];
  if (override) return override;

  if (process.platform === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) return join(appData, "branchy");
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return join(xdg, "branchy");
  return join(homedir(), ".config", "branchy");
}
