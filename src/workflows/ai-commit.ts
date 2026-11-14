/**
 * Optional AI commit message. Off unless the user configures
 * `[ai] command = "…"`: Branchit pipes the staged diff to that program's stdin
 * and reads a message from stdout. No provider is bundled and no keys are
 * handled here; the command runs without a shell, and only after the same
 * explicit trust prompt as pre-commit checks.
 */
import { execa } from "execa";
import { splitCommand } from "../utils/split-command.js";

export interface AiMessage {
  type: string | null;
  scope: string | null;
  breaking: boolean;
  subject: string;
  body: string;
}

const HEADER = /^([a-z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/i;

/** Parse a model's reply into conventional-commit parts; null when empty. */
export function parseAiMessage(raw: string): AiMessage | null {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !/^```/.test(l.trim()));
  while (lines.length && !lines[0]!.trim()) lines.shift();
  if (!lines.length) return null;
  const first = lines[0]!.trim().replace(/^["'`]|["'`]$/g, "");
  const body = lines.slice(1).join("\n").trim();
  const m = first.match(HEADER);
  if (m) {
    return {
      type: m[1]!.toLowerCase(),
      scope: m[2] ? m[2] : null,
      breaking: Boolean(m[3]),
      subject: m[4]!.trim(),
      body,
    };
  }
  return { type: null, scope: null, breaking: false, subject: first, body };
}

/** The trust-store key for an AI command (kept apart from check commands). */
export function aiTrustKey(root: string): string {
  return `${root}#ai`;
}

/** Diffs larger than this are truncated before being sent to the command. */
export const MAX_DIFF_BYTES = 100_000;

export async function generateCommitMessage(
  cwd: string,
  command: string,
  stagedDiff: string,
  timeoutMs = 60_000,
): Promise<{ ok: true; message: AiMessage } | { ok: false; error: string }> {
  const argv = splitCommand(command);
  if (!argv.length) return { ok: false, error: "The [ai] command is empty." };
  const input =
    stagedDiff.length > MAX_DIFF_BYTES
      ? `${stagedDiff.slice(0, MAX_DIFF_BYTES)}\n[diff truncated by branchit]\n`
      : stagedDiff;
  try {
    const res = await execa(argv[0]!, argv.slice(1), {
      cwd,
      input,
      shell: false,
      reject: false,
      timeout: timeoutMs,
    });
    if (res.exitCode !== 0) {
      return {
        ok: false,
        error: `${argv[0]} exited ${res.exitCode}: ${String(res.stderr).trim().slice(0, 200)}`,
      };
    }
    const message = parseAiMessage(String(res.stdout));
    return message ? { ok: true, message } : { ok: false, error: `${argv[0]} printed nothing.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
