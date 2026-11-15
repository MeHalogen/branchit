import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completionScript, SUBCOMMANDS } from "../src/commands/completions.js";

describe("cli entry stays light", () => {
  it("never statically imports Ink, React, or the TUI", () => {
    const src = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
    const staticImports = src.split("\n").filter((l) => /^import\s/.test(l));
    for (const line of staticImports) {
      expect(line).not.toMatch(/["'](ink|react)["']|tui\.js|\/app\/|\/screens\//);
    }
  });
});

describe("completionScript", () => {
  it.each(["zsh", "bash", "fish"] as const)("covers every subcommand for %s", (shell) => {
    const script = completionScript(shell);
    for (const cmd of SUBCOMMANDS) expect(script).toContain(cmd);
    expect(script).toMatch(/--json|-l json/);
  });
  it("returns null for unknown shells", () => {
    expect(completionScript("powershell" as never)).toBeNull();
  });
});
