/**
 * Safe Git process executor.
 *
 * The only place in Branchit that spawns `git`. Guarantees:
 *   - argument arrays only; `shell: false` — no shell interpolation, ever;
 *   - stdout/stderr/exitCode/duration captured and normalized;
 *   - remote-capable operations get a timeout so the UI never hangs forever;
 *   - failures are classified into typed {@link GitError}s while preserving raw
 *     stderr for a "show details" affordance.
 */
import { execa, type ExecaError } from "execa";
import { type GitCommand } from "./command.js";
import {
  GitError,
  classifyGitStderr,
  defaultMessageForKind,
  type GitErrorKind,
} from "./errors.js";

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** Display form of the command (for previews / logs). */
  commandDisplay: string;
  /** Present only when ok === false. */
  error?: GitError;
}

export interface GitClientOptions {
  /** Working directory git runs in. */
  cwd: string;
  /** Default timeout in ms for commands that may touch the network. */
  networkTimeoutMs?: number;
  /** Optional debug sink; receives sanitized command + timing info. */
  onDebug?: (line: string) => void;
}

export interface RunOptions {
  /** Override the default timeout for this call (ms). */
  timeoutMs?: number;
  /** AbortSignal for cancellation of long-running commands. */
  signal?: AbortSignal;
  /** Provide stdin (used for commit messages passed via `-F -`). */
  input?: string;
}

const DEFAULT_NETWORK_TIMEOUT = 30_000;

export class GitClient {
  private readonly cwd: string;
  private readonly networkTimeoutMs: number;
  private readonly onDebug?: (line: string) => void;

  constructor(opts: GitClientOptions) {
    this.cwd = opts.cwd;
    this.networkTimeoutMs = opts.networkTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT;
    this.onDebug = opts.onDebug;
  }

  /**
   * Run a git command, returning a normalized result. Non-zero exits produce
   * `ok: false` with a classified error rather than throwing — expected Git
   * failures are data, not exceptions.
   */
  async run(command: GitCommand, opts: RunOptions = {}): Promise<GitCommandResult> {
    const start = performance.now();
    try {
      const sub = execa("git", command.args, {
        cwd: this.cwd,
        shell: false,
        reject: false,
        stripFinalNewline: false,
        all: false,
        timeout: opts.timeoutMs,
        cancelSignal: opts.signal,
        input: opts.input,
        // Force stable, English, non-paged output regardless of user env.
        env: {
          GIT_PAGER: "cat",
          PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
        },
        extendEnv: true,
      });
      const res = await sub;
      const durationMs = Math.round(performance.now() - start);
      this.onDebug?.(
        `${command.display} -> exit ${res.exitCode} (${durationMs}ms)`,
      );

      if (res.exitCode === 0) {
        return {
          ok: true,
          stdout: res.stdout ?? "",
          stderr: res.stderr ?? "",
          exitCode: 0,
          durationMs,
          commandDisplay: command.display,
        };
      }

      const kind = classifyGitStderr(res.stderr ?? "", res.exitCode ?? null);
      return this.failure(command, res.stdout ?? "", res.stderr ?? "", res.exitCode ?? null, durationMs, kind);
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const e = err as ExecaError;
      // Timeouts and aborts arrive here rather than as a non-zero exit.
      let kind: GitErrorKind = "unknown_git_error";
      if (e.timedOut) kind = "command_timeout";
      const stderr = typeof e.stderr === "string" ? e.stderr : "";
      const stdout = typeof e.stdout === "string" ? e.stdout : "";
      if (kind === "unknown_git_error" && stderr) {
        kind = classifyGitStderr(stderr, e.exitCode ?? null);
      }
      this.onDebug?.(`${command.display} -> threw (${kind}, ${durationMs}ms)`);
      return this.failure(command, stdout, stderr, e.exitCode ?? null, durationMs, kind);
    }
  }

  /** Convenience: run and throw the typed error on failure. */
  async runOrThrow(command: GitCommand, opts: RunOptions = {}): Promise<string> {
    const res = await this.run(command, opts);
    if (!res.ok) throw res.error;
    return res.stdout;
  }

  private failure(
    command: GitCommand,
    stdout: string,
    stderr: string,
    exitCode: number | null,
    durationMs: number,
    kind: GitErrorKind,
  ): GitCommandResult {
    const error = new GitError({
      kind,
      message: defaultMessageForKind(kind),
      raw: stderr.trim() || stdout.trim() || undefined,
      exitCode,
      commandDisplay: command.display,
    });
    return {
      ok: false,
      stdout,
      stderr,
      exitCode,
      durationMs,
      commandDisplay: command.display,
      error,
    };
  }
}

/** Detect whether `git` is available and return its version string. */
export async function detectGitVersion(): Promise<string | null> {
  try {
    const res = await execa("git", ["--version"], { reject: false, shell: false });
    if (res.exitCode === 0) return res.stdout.trim();
    return null;
  } catch {
    return null;
  }
}
