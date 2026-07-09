import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashCommands, isTrusted, trustRepo } from "../src/config/trust.js";

let cfgDir: string;
const prev = process.env["BRANCHIT_CONFIG_DIR"];

beforeEach(async () => {
  cfgDir = await mkdtemp(join(tmpdir(), "branchit-cfg-"));
  process.env["BRANCHIT_CONFIG_DIR"] = cfgDir;
});
afterEach(async () => {
  if (prev === undefined) delete process.env["BRANCHIT_CONFIG_DIR"];
  else process.env["BRANCHIT_CONFIG_DIR"] = prev;
  await rm(cfgDir, { recursive: true, force: true });
});

describe("hashCommands", () => {
  it("is order-independent and stable", () => {
    expect(hashCommands(["a", "b"])).toBe(hashCommands(["b", "a"]));
    expect(hashCommands(["a"])).not.toBe(hashCommands(["a", "b"]));
  });
});

describe("trust store", () => {
  const repo = "/some/repo";
  const cmds = ["npm run lint", "npm run test"];

  it("treats an empty command set as trivially trusted", () => {
    expect(isTrusted(repo, [])).toBe(true);
  });

  it("is untrusted until explicitly trusted", () => {
    expect(isTrusted(repo, cmds)).toBe(false);
    trustRepo(repo, cmds);
    expect(isTrusted(repo, cmds)).toBe(true);
  });

  it("re-prompts (untrusts) when the command set changes", () => {
    trustRepo(repo, cmds);
    expect(isTrusted(repo, cmds)).toBe(true);
    expect(isTrusted(repo, [...cmds, "npm run typecheck"])).toBe(false);
  });

  it("scopes trust per repository", () => {
    trustRepo(repo, cmds);
    expect(isTrusted("/other/repo", cmds)).toBe(false);
  });

  it("persists across separate reads", () => {
    trustRepo(repo, cmds);
    // A fresh call reads from disk again.
    expect(isTrusted(repo, cmds)).toBe(true);
  });
});
