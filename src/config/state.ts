/**
 * Tiny persisted UI state (currently just: has the user seen onboarding).
 * Stored next to config so it honors BRANCHY_CONFIG_DIR.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./paths.js";

interface StateFile {
  onboarded?: boolean;
}

function statePath(): string {
  return join(configDir(), "state.json");
}

function read(): StateFile {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as StateFile;
  } catch {
    return {};
  }
}

export function hasOnboarded(): boolean {
  return read().onboarded === true;
}

export function markOnboarded(): void {
  const state = { ...read(), onboarded: true };
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n");
  } catch {
    // Non-fatal: onboarding simply shows again next time.
  }
}
