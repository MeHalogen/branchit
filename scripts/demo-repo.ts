/**
 * Generates a throwaway demo repository for screenshots, GIFs, and manual
 * testing. Creates a variety of branch states against a local bare "remote"
 * so it needs no network.
 *
 *   node --import tsx scripts/demo-repo.ts [targetDir]
 */
import { execa } from "execa";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function git(cwd: string, args: string[]) {
  const res = await execa("git", args, { cwd, reject: false, shell: false });
  if (res.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${res.stderr}`);
  }
  return res.stdout;
}

async function commit(dir: string, file: string, content: string, message: string) {
  const abs = join(dir, file);
  const slash = abs.lastIndexOf("/");
  if (slash > -1) await mkdir(abs.slice(0, slash), { recursive: true });
  await writeFile(abs, content);
  await git(dir, ["add", "--", file]);
  await git(dir, ["commit", "-m", message]);
}

async function main() {
  const target = process.argv[2];
  const dir = target ?? (await mkdtemp(join(tmpdir(), "branchy-demo-")));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });

  const remote = await mkdtemp(join(tmpdir(), "branchy-demo-remote-"));
  await git(remote, ["init", "--bare", "-b", "main"]);

  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "demo@branchy.dev"]);
  await git(dir, ["config", "user.name", "Branchy Demo"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);

  await commit(dir, "README.md", "# payments-api\n", "chore: initial commit");
  await commit(dir, "src/index.ts", "export const version = '1.0.0';\n", "feat: bootstrap service");
  await git(dir, ["remote", "add", "origin", remote]);
  await git(dir, ["push", "-u", "origin", "main"]);
  await git(dir, ["remote", "set-head", "origin", "main"]);

  // A merged feature branch (safe to sweep later).
  await git(dir, ["switch", "-c", "feat/payment-copy"]);
  await commit(dir, "src/copy.ts", "export const copy = {};\n", "feat: payment copy");
  await git(dir, ["switch", "main"]);
  await git(dir, ["merge", "--no-ff", "feat/payment-copy", "-m", "Merge feat/payment-copy"]);

  // An unmerged experiment.
  await git(dir, ["switch", "-c", "experiment/cache"]);
  await commit(dir, "src/cache.ts", "export const cache = new Map();\n", "feat: experimental cache");
  await git(dir, ["switch", "main"]);

  // A branch that is ahead of its upstream.
  await git(dir, ["switch", "-c", "feat/payment-retry"]);
  await commit(dir, "src/retry.ts", "export function retry() {}\n", "feat: retry logic");
  await git(dir, ["push", "-u", "origin", "feat/payment-retry"]);
  await commit(dir, "src/retry.ts", "export function retry() { /* v2 */ }\n", "feat: retry v2 (unpushed)");

  // A remote-gone branch: pushed then deleted upstream.
  await git(dir, ["switch", "-c", "fix/old-header"]);
  await commit(dir, "src/header.ts", "export const header = 1;\n", "fix: header");
  await git(dir, ["push", "-u", "origin", "fix/old-header"]);
  await git(dir, ["push", "origin", "--delete", "fix/old-header"]);
  await git(dir, ["fetch", "origin", "--prune"]);

  await git(dir, ["switch", "main"]);
  // Leave a dirty working tree for a lively dashboard.
  await writeFile(join(dir, "src/index.ts"), "export const version = '1.1.0';\n");
  await writeFile(join(dir, "notes.todo"), "- wire up retries\n");

  process.stdout.write(`Demo repository ready:\n  ${dir}\n\nTry it:\n  cd ${dir} && branchy\n`);
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
