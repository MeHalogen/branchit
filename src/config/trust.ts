/**
 * Repository trust store.
 *
 * Pre-commit checks execute programs defined by (or inferred from) a repository.
 * A malicious repo could define `"lint": "rm -rf ~"`, so Branchy NEVER runs
 * these automatically: a repository must be explicitly trusted for a specific
 * set of commands. If the command set later changes, the recorded hash no
 * longer matches and Branchy re-prompts.
 *
 * The store lives under the per-user config dir and maps repository root →
 * the hash of the last-trusted command set.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./paths.js";

interface TrustFile {
  version: 1;
  repos: Record<string, { hash: string; commands: string[] }>;
}

function trustFilePath(): string {
  return join(configDir(), "trust.json");
}

/** Stable hash of a command set (order-independent, display-string based). */
export function hashCommands(displays: string[]): string {
  const canonical = JSON.stringify([...displays].sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function readTrust(): TrustFile {
  try {
    const raw = readFileSync(trustFilePath(), "utf8");
    const parsed = JSON.parse(raw) as TrustFile;
    if (parsed && parsed.version === 1 && parsed.repos) return parsed;
  } catch {
    // Missing or malformed file => nothing is trusted yet.
  }
  return { version: 1, repos: {} };
}

/** Has `root` been trusted for exactly this set of command display strings? */
export function isTrusted(root: string, displays: string[]): boolean {
  if (displays.length === 0) return true; // nothing to run, nothing to trust
  const store = readTrust();
  const entry = store.repos[root];
  return entry?.hash === hashCommands(displays);
}

/** Persist trust for `root` and this specific command set. */
export function trustRepo(root: string, displays: string[]): void {
  const store = readTrust();
  store.repos[root] = { hash: hashCommands(displays), commands: displays };
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(trustFilePath(), JSON.stringify(store, null, 2) + "\n", {
    mode: 0o600,
  });
}
