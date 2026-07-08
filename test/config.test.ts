import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/load.js";
import { defaultConfig, mergeConfig, ConfigFileSchema } from "../src/config/schema.js";

let cfgDir: string;
let repoDir: string;
const prev = process.env["BRANCHY_CONFIG_DIR"];

beforeEach(async () => {
  cfgDir = await mkdtemp(join(tmpdir(), "branchy-ucfg-"));
  repoDir = await mkdtemp(join(tmpdir(), "branchy-repo-"));
  process.env["BRANCHY_CONFIG_DIR"] = cfgDir;
});
afterEach(async () => {
  if (prev === undefined) delete process.env["BRANCHY_CONFIG_DIR"];
  else process.env["BRANCHY_CONFIG_DIR"] = prev;
  await rm(cfgDir, { recursive: true, force: true });
  await rm(repoDir, { recursive: true, force: true });
});

describe("defaults", () => {
  it("returns sane defaults when no files exist", () => {
    const { config, issues, sources } = loadConfig(repoDir);
    expect(issues).toEqual([]);
    expect(sources).toEqual([]);
    expect(config.branches.protected).toContain("main");
    expect(config.commit.maxSubjectLength).toBe(72);
    expect(config.checks.commands).toBeNull();
  });
});

describe("mergeConfig", () => {
  it("normalizes string and object commit types", () => {
    const merged = mergeConfig(defaultConfig(), {
      commit: { types: ["feat", { name: "wip", description: "in progress" }] },
    });
    expect(merged.commit.types).toEqual([
      { name: "feat", description: "" },
      { name: "wip", description: "in progress" },
    ]);
  });
});

describe("loadConfig precedence", () => {
  it("applies repo config over user config over defaults", async () => {
    await writeFile(
      join(cfgDir, "config.toml"),
      '[ui]\ncommand_preview = false\n[branches]\nprotected = ["main"]\n',
    );
    await writeFile(
      join(repoDir, ".branchy.toml"),
      '[branches]\nprotected = ["main","release/*"]\ndefault_base = "develop"\n',
    );
    const { config, sources } = loadConfig(repoDir);
    expect(config.ui.commandPreview).toBe(false); // from user config
    expect(config.branches.protected).toEqual(["main", "release/*"]); // repo wins
    expect(config.branches.defaultBase).toBe("develop");
    expect(sources).toHaveLength(2);
  });

  it("reads check commands from repo config", async () => {
    await writeFile(
      join(repoDir, ".branchy.toml"),
      '[checks]\ncommands = ["pnpm lint", "pnpm test"]\n',
    );
    expect(loadConfig(repoDir).config.checks.commands).toEqual(["pnpm lint", "pnpm test"]);
  });
});

describe("validation", () => {
  it("reports a precise issue and skips an invalid layer without crashing", async () => {
    await writeFile(join(repoDir, ".branchy.toml"), '[ui]\ntheme = "neon"\n');
    const { config, issues } = loadConfig(repoDir);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.field).toBe("ui.theme");
    // Falls back to defaults for the invalid layer.
    expect(config.ui.theme).toBe("default");
  });

  it("rejects unknown keys", async () => {
    await writeFile(join(repoDir, ".branchy.toml"), '[ui]\nbogus = 1\n');
    const { issues } = loadConfig(repoDir);
    expect(issues.some((i) => i.message.toLowerCase().includes("unrecognized"))).toBe(true);
  });

  it("reports invalid TOML as a whole-file issue", async () => {
    await writeFile(join(repoDir, ".branchy.toml"), "this is = = not valid toml\n");
    const { issues } = loadConfig(repoDir);
    expect(issues.some((i) => i.message.includes("invalid TOML"))).toBe(true);
  });

  it("schema accepts a fully-populated valid file", () => {
    const parsed = ConfigFileSchema.safeParse({
      ui: { command_preview: true, icons: false, theme: "none" },
      branches: { default_base: "main", protected: ["main"] },
      commit: { types: ["feat"], scopes: ["api"], max_subject_length: 50, require_scope: true },
      checks: { commands: ["npm test"] },
    });
    expect(parsed.success).toBe(true);
  });
});
