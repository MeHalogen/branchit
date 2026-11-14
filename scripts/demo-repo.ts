/**
 * Generates a throwaway demo repository for screenshots, GIFs, and manual
 * testing. Creates a variety of branch states against a local bare "remote"
 * so it needs no network.
 *
 *   node --import tsx scripts/demo-repo.ts [targetDir]
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

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

/** A merged feature branch: branch off main, commit, merge back, --no-ff. */
async function mergedBranch(dir: string, name: string, file: string, msg: string) {
  await git(dir, ["switch", "-c", name]);
  await commit(dir, file, `// ${name}\n`, msg);
  await git(dir, ["switch", "main"]);
  await git(dir, ["merge", "--no-ff", name, "-m", `Merge ${name}`]);
}

async function main() {
  const target = process.argv[2];
  const dir = target ?? (await mkdtemp(join(tmpdir(), "branchit-demo-")));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });

  const remote = await mkdtemp(join(tmpdir(), "branchit-demo-remote-"));
  await git(remote, ["init", "--bare", "-b", "main"]);

  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "demo@branchit.dev"]);
  await git(dir, ["config", "user.name", "Branchit Demo"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);

  await commit(dir, "README.md", "# payments-api\n", "chore: initial commit");
  await commit(
    dir,
    "package.json",
    `${JSON.stringify(
      {
        name: "payments-api",
        version: "1.0.0",
        scripts: {
          typecheck: "echo '✓ TypeScript types clean' && sleep 0.5",
          lint: "echo '✓ ESLint passed' && sleep 0.5",
          test: "echo '✓ 42 unit tests passed' && sleep 0.5",
        },
      },
      null,
      2,
    )}\n`,
    "chore: add package.json",
  );
  await commit(
    dir,
    ".branchit.toml",
    `[ui]
command_preview = true
theme = "default"

[branches]
default_base = "main"
protected = ["main", "release/*"]

[commit]
scopes = ["cli", "git", "ui", "payments"]
max_subject_length = 72
require_scope = true
`,
    "chore: add branchit config",
  );
  await commit(dir, "src/index.ts", "export const version = '1.0.0';\n", "feat: bootstrap service");
  await commit(
    dir,
    "src/payments/retry.ts",
    "export function retry() {}\n",
    "feat(payments): add retry stub",
  );
  await git(dir, ["remote", "add", "origin", remote]);
  await git(dir, ["push", "-u", "origin", "main"]);
  await git(dir, ["remote", "set-head", "origin", "main"]);

  // Several merged branches — satisfying to sweep.
  await mergedBranch(dir, "feat/payment-copy", "src/copy.ts", "feat: payment copy");
  await mergedBranch(dir, "fix/header-spacing", "src/header.ts", "fix: header spacing");
  await mergedBranch(dir, "chore/bump-sdk", "src/sdk.ts", "chore: bump sdk");
  await mergedBranch(dir, "docs/api-examples", "docs/api.md", "docs: api examples");

  // An unmerged experiment.
  await git(dir, ["switch", "-c", "experiment/redis-cache"]);
  await commit(
    dir,
    "src/cache.ts",
    "export const cache = new Map();\n",
    "feat: experimental cache",
  );
  await git(dir, ["switch", "main"]);

  // A branch ahead of its upstream (does not touch the dirty file below).
  await git(dir, ["switch", "-c", "feat/payment-retry"]);
  await commit(
    dir,
    "src/payments/policy.ts",
    "export const policy = {};\n",
    "feat(payments): retry policy",
  );
  await git(dir, ["push", "-u", "origin", "feat/payment-retry"]);
  await commit(
    dir,
    "src/payments/policy.ts",
    "export const policy = { max: 5 };\n",
    "feat(payments): tune policy (unpushed)",
  );

  // A remote-gone branch: pushed then deleted upstream.
  await git(dir, ["switch", "-c", "fix/legacy-webhook"]);
  await commit(dir, "src/webhook.ts", "export const hook = 1;\n", "fix: legacy webhook");
  await git(dir, ["push", "-u", "origin", "fix/legacy-webhook"]);
  await git(dir, ["push", "origin", "--delete", "fix/legacy-webhook"]);
  await git(dir, ["fetch", "origin", "--prune"]);

  await git(dir, ["switch", "main"]);
  await git(dir, ["remote", "set-url", "origin", "https://github.com/acme/payments-api.git"]);
  await git(dir, ["remote", "set-url", "--push", "origin", remote]);
  // Leave a dirty working tree with a change under src/payments/ so the commit
  // helper infers a "payments" scope. This file is untouched by the branches
  // above, so switching carries it over cleanly.
  await writeFile(
    join(dir, "src/payments/retry.ts"),
    "export function retry() { /* backoff */ }\n",
  );
  await writeFile(join(dir, "TODO.md"), "- wire up exponential backoff\n");

  process.stdout.write(`Demo repository ready:\n  ${dir}\n\nTry it:\n  cd ${dir} && branchit\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
