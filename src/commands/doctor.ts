/**
 * `branchit doctor` — environment diagnostics.
 *
 * Output is plain text and safe to paste into a bug report: no tokens, no
 * credentialed remote URLs, no repository paths beyond the current directory.
 */
import { detectGitVersion } from "../git/client.js";
import { detectRepository } from "../git/repository.js";

export async function runDoctor(opts: { version: string }): Promise<void> {
  const lines: string[] = [];
  const ok = (label: string, value: string) => lines.push(`  ✓ ${label}: ${value}`);
  const warn = (label: string, value: string) => lines.push(`  ! ${label}: ${value}`);

  lines.push("branchit doctor");
  lines.push("");

  ok("branchit", opts.version);
  ok("node", process.version);
  ok("platform", `${process.platform} ${process.arch}`);

  const gitVersion = await detectGitVersion();
  if (gitVersion) ok("git", gitVersion);
  else warn("git", "not found on PATH — Branchit requires Git");

  const cwd = process.cwd();
  const detect = await detectRepository(cwd);
  if (detect.isRepo) {
    ok("repository", detect.isBare ? "bare repository" : "detected");
  } else {
    warn("repository", "not inside a Git repository");
  }

  ok("tty", process.stdout.isTTY ? "yes" : "no (non-interactive)");
  ok("color", process.env["NO_COLOR"] ? "disabled (NO_COLOR)" : "enabled");
  ok("TERM", process.env["TERM"] ?? "(unset)");
  ok("editor", process.env["EDITOR"] ?? process.env["VISUAL"] ?? "(unset)");
  ok("pager", process.env["PAGER"] ?? "(unset)");

  process.stdout.write(lines.join("\n") + "\n");
}
