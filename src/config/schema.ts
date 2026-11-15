/**
 * Branchit configuration schema, defaults, and the resolved shape the app uses.
 *
 * Config is layered: built-in defaults < user config < repo `.branchit.toml` <
 * CLI flags. Files are validated with zod so a typo yields a precise
 * "file:field — message" error rather than silent misbehavior or a crash.
 */
import { z } from "zod";
import { COMMIT_TYPES, type CommitType } from "../workflows/commit.js";
import { DEFAULT_PROTECTED } from "../workflows/sweep.js";

const CommitTypeSchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), description: z.string().optional() }).strict(),
]);

/** Raw (file) schema. Every field optional; unknown keys are rejected. */
export const ConfigFileSchema = z
  .object({
    ui: z
      .object({
        command_preview: z.boolean().optional(),
        icons: z.boolean().optional(),
        theme: z.enum(["default", "catppuccin", "tokyo-night", "gruvbox", "none"]).optional(),
      })
      .strict()
      .optional(),
    branches: z
      .object({
        default_base: z.string().min(1).optional(),
        protected: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    commit: z
      .object({
        types: z.array(CommitTypeSchema).optional(),
        scopes: z.array(z.string().min(1)).optional(),
        max_subject_length: z.number().int().positive().optional(),
        require_scope: z.boolean().optional(),
      })
      .strict()
      .optional(),
    checks: z
      .object({
        commands: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    keys: z.record(z.string(), z.string()).optional(),
    ai: z
      .object({
        /** Program that reads a staged diff on stdin and prints a message. */
        command: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    worktrees: z
      .object({
        /** Where new worktrees go; {repo} and {branch} are substituted. */
        root: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

/** Fully-resolved config consumed by the app (no optionals). */
export interface ResolvedConfig {
  ui: {
    commandPreview: boolean;
    icons: boolean;
    /** A named palette, or "none" for no color. */
    theme: "default" | "catppuccin" | "tokyo-night" | "gruvbox" | "none";
  };
  branches: {
    /** Explicit base override, or null to auto-detect. */
    defaultBase: string | null;
    protected: string[];
  };
  commit: {
    types: CommitType[];
    scopes: string[];
    maxSubjectLength: number;
    requireScope: boolean;
  };
  checks: {
    /** Explicit command strings, or null to auto-detect from package.json. */
    commands: string[] | null;
  };
  worktrees: {
    /** Path template, relative to the repository root unless absolute. */
    root: string;
  };
  /** Short command name -> single key, e.g. { sweep: "x" }. */
  keys: Record<string, string>;
  ai: {
    command: string | null;
  };
}

export function defaultConfig(): ResolvedConfig {
  return {
    ui: { commandPreview: true, icons: true, theme: "default" },
    branches: { defaultBase: null, protected: [...DEFAULT_PROTECTED] },
    commit: {
      types: COMMIT_TYPES,
      scopes: [],
      maxSubjectLength: 72,
      requireScope: false,
    },
    checks: { commands: null },
    worktrees: { root: "../{repo}-wt/{branch}" },
    keys: {},
    ai: { command: null },
  };
}

type RawCommitType = string | { name: string; description?: string };

function normalizeTypes(types: RawCommitType[] | undefined): CommitType[] | undefined {
  if (!types) return undefined;
  return types.map((t) =>
    typeof t === "string"
      ? { name: t, description: "" }
      : { name: t.name, description: t.description ?? "" },
  );
}

/** Fold a validated file layer onto an accumulator config (in place, returns new). */
export function mergeConfig(base: ResolvedConfig, file: ConfigFile): ResolvedConfig {
  const next: ResolvedConfig = {
    ui: { ...base.ui },
    branches: { ...base.branches, protected: [...base.branches.protected] },
    commit: { ...base.commit, types: [...base.commit.types], scopes: [...base.commit.scopes] },
    checks: { ...base.checks },
    worktrees: { ...base.worktrees },
    keys: { ...base.keys },
    ai: { ...base.ai },
  };
  if (file.ui) {
    if (file.ui.command_preview !== undefined) next.ui.commandPreview = file.ui.command_preview;
    if (file.ui.icons !== undefined) next.ui.icons = file.ui.icons;
    if (file.ui.theme !== undefined) next.ui.theme = file.ui.theme;
  }
  if (file.branches) {
    if (file.branches.default_base !== undefined)
      next.branches.defaultBase = file.branches.default_base;
    if (file.branches.protected !== undefined) next.branches.protected = file.branches.protected;
  }
  if (file.commit) {
    const t = normalizeTypes(file.commit.types);
    if (t) next.commit.types = t;
    if (file.commit.scopes !== undefined) next.commit.scopes = file.commit.scopes;
    if (file.commit.max_subject_length !== undefined)
      next.commit.maxSubjectLength = file.commit.max_subject_length;
    if (file.commit.require_scope !== undefined)
      next.commit.requireScope = file.commit.require_scope;
  }
  if (file.checks) {
    if (file.checks.commands !== undefined) next.checks.commands = file.checks.commands;
  }
  if (file.worktrees?.root !== undefined) next.worktrees.root = file.worktrees.root;
  if (file.keys) Object.assign(next.keys, file.keys);
  if (file.ai?.command !== undefined) next.ai.command = file.ai.command;
  return next;
}
