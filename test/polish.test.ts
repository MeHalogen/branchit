import { describe, expect, it } from "vitest";
import { ConfigFileSchema, defaultConfig, mergeConfig } from "../src/config/schema.js";
import { COMMANDS, resolveKeymap } from "../src/keys/registry.js";
import { resolveTheme, THEME_NAMES } from "../src/theme/tokens.js";
import { mapPool } from "../src/utils/pool.js";
import { splitCommand } from "../src/utils/split-command.js";
import { parseAiMessage } from "../src/workflows/ai-commit.js";

describe("themes", () => {
  it("ships the named palettes and none", () => {
    expect(THEME_NAMES).toEqual(["default", "catppuccin", "tokyo-night", "gruvbox", "none"]);
    for (const name of THEME_NAMES) {
      const t = resolveTheme({ noColor: false, ascii: false, name });
      expect(t.noColor).toBe(name === "none");
    }
    expect(
      resolveTheme({ noColor: false, ascii: false, name: "catppuccin" }).theme.primary,
    ).toMatch(/^#/);
  });
  it("NO_COLOR always wins over a named palette", () => {
    expect(resolveTheme({ noColor: true, ascii: false, name: "gruvbox" }).theme.primary).toBe("");
  });
  it("is selectable in config", () => {
    const file = ConfigFileSchema.parse({ ui: { theme: "tokyo-night" } });
    expect(mergeConfig(defaultConfig(), file).ui.theme).toBe("tokyo-night");
  });
});

describe("resolveKeymap", () => {
  it("applies overrides by short command name", () => {
    const { shortcuts, errors } = resolveKeymap({ sweep: "x", commit: "C" });
    expect(errors).toEqual([]);
    expect(shortcuts.get("dashboard.sweep")).toBe("x");
    expect(shortcuts.get("dashboard.commit")).toBe("C");
    expect(shortcuts.get("dashboard.switchBranch")).toBe("b");
  });
  it("rejects collisions, unknown names and reserved keys", () => {
    const { errors } = resolveKeymap({ sweep: "b", nope: "z", undo: ":" });
    expect(errors.join("\n")).toContain("collides");
    expect(errors.join("\n")).toContain("unknown command 'nope'");
    expect(errors.join("\n")).toContain("reserved");
  });
  it("defaults have no collisions", () => {
    expect(resolveKeymap({}).errors).toEqual([]);
    expect(COMMANDS.length).toBeGreaterThan(10);
  });
});

describe("splitCommand", () => {
  it("honours quotes and escapes without a shell", () => {
    expect(splitCommand(`llm -m "claude sonnet" --system 'be brief'`)).toEqual([
      "llm",
      "-m",
      "claude sonnet",
      "--system",
      "be brief",
    ]);
    expect(splitCommand(`node -e "process.exit(1)"`)).toEqual(["node", "-e", "process.exit(1)"]);
    expect(splitCommand(`a\\ b c`)).toEqual(["a b", "c"]);
  });
  it("never expands shell syntax", () => {
    expect(splitCommand("echo $HOME; rm -rf ~")).toEqual(["echo", "$HOME;", "rm", "-rf", "~"]);
  });
});

describe("parseAiMessage", () => {
  it("parses a conventional header and body", () => {
    expect(parseAiMessage("feat(auth)!: add login\n\nWith OAuth.\nAnd tests.\n")).toEqual({
      type: "feat",
      scope: "auth",
      breaking: true,
      subject: "add login",
      body: "With OAuth.\nAnd tests.",
    });
  });
  it("accepts plain subjects and strips code fences and quotes", () => {
    expect(parseAiMessage('```\n"Fix the flaky test"\n```')).toEqual({
      type: null,
      scope: null,
      breaking: false,
      subject: "Fix the flaky test",
      body: "",
    });
  });
  it("returns null for empty output", () => {
    expect(parseAiMessage("  \n")).toBeNull();
  });
});

describe("mapPool", () => {
  it("preserves order and bounds concurrency", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([5, 1, 4, 2, 3], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n * 3));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
