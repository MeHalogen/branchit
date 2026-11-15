/**
 * `branchit demo` — a safe playground.
 *
 * Seeds a throwaway repository with merged, unmerged, squash-free, ahead-of-
 * upstream and remote-gone branches against a local bare "remote" (no
 * network), plus a dirty working tree. Nothing here touches the user's repos.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execa } from "execa";

/**
 * Simulated clock so the sandbox looks like a lived-in repository: commits are
 * dated `daysAgo` days in the past (set before each part of the story).
 */
let daysAgo = 0;
function at(days: number): void {
  daysAgo = days;
}
function stamp(): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

async function git(cwd: string, args: string[]) {
  const res = await execa("git", args, {
    cwd,
    reject: false,
    shell: false,
    env: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_DATE: stamp(),
      GIT_COMMITTER_DATE: stamp(),
    },
    extendEnv: true,
  });
  if (res.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${res.stderr}`);
  }
  return res.stdout;
}

async function commit(dir: string, file: string, content: string, message: string) {
  const abs = join(dir, file);
  await mkdir(dirname(abs), { recursive: true });
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

/**
 * Create the demo repository in `target` (replaced if it exists) or a fresh
 * temp directory. Returns the repository path.
 */
export async function createDemoRepo(target?: string): Promise<string> {
  let dir: string;
  if (target) {
    dir = target;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await mkdir(dir, { recursive: true });
  } else {
    dir = await mkdtemp(join(tmpdir(), "branchit-demo-"));
  }

  const remote = await mkdtemp(join(tmpdir(), "branchit-demo-remote-"));
  await git(remote, ["init", "--bare", "-b", "main"]);

  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "demo@branchit.dev"]);
  await git(dir, ["config", "user.name", "Branchit Demo"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);

  at(430);
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
  at(400);
  await mergedBranch(dir, "feat/payment-copy", "src/copy.ts", "feat: payment copy");
  at(310);
  await mergedBranch(dir, "fix/header-spacing", "src/header.ts", "fix: header spacing");
  at(150);
  await mergedBranch(dir, "chore/bump-sdk", "src/sdk.ts", "chore: bump sdk");
  at(75);
  await mergedBranch(dir, "docs/api-examples", "docs/api.md", "docs: api examples");

  // A squash-merged branch: same change landed on main as one new commit, so
  // the branch is patch-equivalent but not an ancestor ("likely" merged).
  at(45);
  await git(dir, ["switch", "-c", "feat/receipts"]);
  await commit(dir, "src/receipts.ts", "export const receipts = [];\n", "feat: receipts list");
  await git(dir, ["switch", "main"]);
  at(44);
  await commit(dir, "src/receipts.ts", "export const receipts = [];\n", "feat: receipts (#42)");

  // An unmerged experiment.
  at(60);
  await git(dir, ["switch", "-c", "experiment/redis-cache"]);
  await commit(
    dir,
    "src/cache.ts",
    "export const cache = new Map();\n",
    "feat: experimental cache",
  );
  await git(dir, ["switch", "main"]);

  // A branch ahead of its upstream (does not touch the dirty file below).
  at(4);
  await git(dir, ["switch", "-c", "feat/payment-retry"]);
  await commit(
    dir,
    "src/payments/policy.ts",
    "export const policy = {};\n",
    "feat(payments): retry policy",
  );
  await git(dir, ["push", "-u", "origin", "feat/payment-retry"]);
  at(1);
  await commit(
    dir,
    "src/payments/policy.ts",
    "export const policy = { max: 5 };\n",
    "feat(payments): tune policy (unpushed)",
  );

  // A remote-gone branch: pushed then deleted upstream.
  at(30);
  await git(dir, ["switch", "-c", "fix/legacy-webhook", "main"]);
  await commit(dir, "src/webhook.ts", "export const hook = 1;\n", "fix: legacy webhook");
  await git(dir, ["push", "-u", "origin", "fix/legacy-webhook"]);
  await git(dir, ["push", "origin", "--delete", "fix/legacy-webhook"]);
  await git(dir, ["fetch", "origin", "--prune"]);

  at(0);
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

  return dir;
}
