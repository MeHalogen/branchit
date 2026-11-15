/**
 * Integration test fixtures.
 *
 * Creates real, throwaway Git repositories in the OS temp dir and drives them
 * with real `git` invocations — no mocks. A bare repo can act as a fake remote,
 * so tests never touch the network.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execa } from "execa";

export class TempRepo {
  constructor(public readonly dir: string) {}

  async git(args: string[]): Promise<string> {
    const res = await execa("git", args, {
      cwd: this.dir,
      shell: false,
      reject: false,
      env: { GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
      extendEnv: true,
    });
    if (res.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed (${res.exitCode}): ${res.stderr}`);
    }
    return res.stdout;
  }

  async writeFileAt(relPath: string, content: string): Promise<void> {
    const abs = join(this.dir, relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }

  async commitFile(relPath: string, content: string, message: string): Promise<string> {
    await this.writeFileAt(relPath, content);
    await this.git(["add", "--", relPath]);
    await this.git(["commit", "-m", message]);
    return (await this.git(["rev-parse", "HEAD"])).trim();
  }

  async createBranch(name: string, base = "HEAD"): Promise<void> {
    await this.git(["branch", name, base]);
  }

  async checkout(name: string): Promise<void> {
    await this.git(["checkout", name]);
  }

  async cleanup(): Promise<void> {
    // Windows keeps a directory busy briefly after a git child exits.
    await rm(this.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

/** Create an initialized repo with a deterministic identity and one commit. */
export async function createRepo(
  opts: { initialBranch?: string; withInitialCommit?: boolean } = {},
): Promise<TempRepo> {
  const dir = await mkdtemp(join(tmpdir(), "branchit-test-"));
  const repo = new TempRepo(dir);
  await repo.git(["init", "-b", opts.initialBranch ?? "main"]);
  await repo.git(["config", "user.email", "test@branchit.dev"]);
  await repo.git(["config", "user.name", "Branchit Test"]);
  await repo.git(["config", "commit.gpgsign", "false"]);
  if (opts.withInitialCommit !== false) {
    await repo.commitFile("README.md", "# test\n", "chore: initial commit");
  }
  return repo;
}

/** Create a bare repo usable as a fake remote. */
export async function createBareRemote(): Promise<TempRepo> {
  const dir = await mkdtemp(join(tmpdir(), "branchit-remote-"));
  const repo = new TempRepo(dir);
  await repo.git(["init", "--bare", "-b", "main"]);
  return repo;
}
