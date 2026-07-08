/**
 * Pre-commit checks: detection and execution.
 *
 * Detection only *suggests* commands from a repository's manifest — it never
 * runs them. Execution requires explicit trust (see config/trust.ts) and is
 * done here with argument arrays and `shell: false`. A check name existing is
 * never treated as proof it is safe to run.
 */
import { execa } from "execa";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CheckCommand {
  /** Short label, e.g. "lint". */
  name: string;
  /** Human display, e.g. "pnpm run lint". Also the trust-hash input. */
  display: string;
  /** argv used for execution (no shell). */
  argv: string[];
}

export type CheckStatus = "waiting" | "running" | "passed" | "failed" | "cancelled";

export interface CheckState {
  command: CheckCommand;
  status: CheckStatus;
  durationMs?: number;
  exitCode?: number | null;
  /** Combined stdout+stderr, kept for the failure log view. */
  output?: string;
}

export interface CheckRunResult {
  passed: boolean;
  results: CheckState[];
}

// npm-script names Branchy knows how to suggest, in a sensible run order.
const KNOWN_SCRIPTS = ["typecheck", "lint", "test", "check", "format:check"];

function detectPackageManager(root: string): string {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Suggest pre-commit checks from `package.json` scripts. Returns only known,
 * present scripts, as `<pm> run <script>`. Empty array when there is nothing to
 * suggest. Purely advisory — the caller must obtain trust before running.
 */
export function detectChecks(root: string): CheckCommand[] {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return [];
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, unknown>;
    };
    scripts = pkg.scripts ?? {};
  } catch {
    return [];
  }
  const pm = detectPackageManager(root);
  const out: CheckCommand[] = [];
  for (const name of KNOWN_SCRIPTS) {
    if (typeof scripts[name] === "string") {
      out.push({ name, display: `${pm} run ${name}`, argv: [pm, "run", name] });
    }
  }
  return out;
}

/**
 * Run checks sequentially, reporting progress after each state transition.
 * Stops early on the first failure (a failed check should block a commit). An
 * AbortSignal cancels the remaining checks and marks them cancelled.
 */
export async function runChecks(
  cwd: string,
  commands: CheckCommand[],
  onProgress: (states: CheckState[]) => void,
  signal?: AbortSignal,
): Promise<CheckRunResult> {
  const states: CheckState[] = commands.map((command) => ({
    command,
    status: "waiting",
  }));
  onProgress(clone(states));

  let passed = true;
  for (let i = 0; i < commands.length; i++) {
    if (signal?.aborted) {
      for (let j = i; j < states.length; j++) states[j]!.status = "cancelled";
      onProgress(clone(states));
      return { passed: false, results: states };
    }
    const state = states[i]!;
    state.status = "running";
    onProgress(clone(states));

    const start = performance.now();
    const [cmd, ...args] = state.command.argv;
    const res = await execa(cmd!, args, {
      cwd,
      shell: false,
      reject: false,
      all: true,
      cancelSignal: signal,
    }).catch((e: unknown) => ({ exitCode: 1, all: String((e as Error)?.message ?? e) }));
    state.durationMs = Math.round(performance.now() - start);
    state.exitCode = res.exitCode ?? null;
    state.output = "all" in res && typeof res.all === "string" ? res.all : "";

    if (res.exitCode === 0) {
      state.status = "passed";
    } else {
      state.status = "failed";
      passed = false;
      onProgress(clone(states));
      // Block on first failure; leave the rest as waiting.
      return { passed: false, results: states };
    }
    onProgress(clone(states));
  }
  return { passed, results: states };
}

function clone(states: CheckState[]): CheckState[] {
  return states.map((s) => ({ ...s }));
}
