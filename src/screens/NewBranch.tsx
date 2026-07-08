import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { RepoData } from "../app/loadRepo.js";
import { useColor, useTheme } from "../app/theme-context.js";
import { sanitizeForDisplay } from "../utils/format.js";

const TYPES = ["feat", "fix", "chore", "docs", "refactor", "hotfix"] as const;

/** Slugify a free-text description into a branch-name-safe segment. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Minimal, real branch-creation flow: pick a type, type a description, preview
 * the generated name, and create from the current base. No fake steps.
 */
export function NewBranch(props: {
  data: RepoData;
  width: number;
  base: string;
  onCreate: (name: string, base: string) => void;
  onClose: () => void;
  commandPreview: boolean;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const [typeIdx, setTypeIdx] = useState(0);
  const [desc, setDesc] = useState("");
  const [stage, setStage] = useState<"type" | "desc">("type");

  const type = TYPES[typeIdx]!;
  const slug = slugify(desc);
  const name = slug ? `${type}/${slug}` : `${type}/`;

  const existingNames = useMemo(
    () => new Set(props.data.branches.filter((b) => b.kind === "local").map((b) => b.name)),
    [props.data.branches],
  );
  const collision = slug !== "" && existingNames.has(name);

  useInput((input, key) => {
    if (key.escape) {
      props.onClose();
      return;
    }
    if (stage === "type") {
      if (key.leftArrow) setTypeIdx((i) => (i - 1 + TYPES.length) % TYPES.length);
      else if (key.rightArrow || key.tab)
        setTypeIdx((i) => (i + 1) % TYPES.length);
      else if (key.return) setStage("desc");
      return;
    }
    // desc stage
    if (key.return) {
      if (slug && !collision) props.onCreate(name, props.base);
      return;
    }
    if (key.tab) {
      setStage("type");
      return;
    }
    if (key.backspace || key.delete) {
      setDesc((d) => d.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setDesc((d) => d + input);
  });

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        New branch
      </Text>

      <Box marginTop={1}>
        <Box width={14}>
          <Text color={color("dim")}>Type</Text>
        </Box>
        <Box>
          {TYPES.map((t, i) => (
            <Box key={t} marginRight={1}>
              <Text
                color={i === typeIdx ? color("selectedText") : color("dim")}
                backgroundColor={
                  i === typeIdx && stage === "type" ? color("selectedBg") : undefined
                }
                bold={i === typeIdx}
              >
                {" "}
                {t}{" "}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box width={14}>
          <Text color={color("dim")}>Description</Text>
        </Box>
        <Text color={color("text")}>{sanitizeForDisplay(desc)}</Text>
        {stage === "desc" ? <Text color={color("primary")}>▏</Text> : null}
      </Box>

      <Box marginTop={1}>
        <Box width={14}>
          <Text color={color("dim")}>Branch name</Text>
        </Box>
        <Text color={collision ? color("danger") : color("success")} bold>
          {sanitizeForDisplay(name)}
        </Text>
      </Box>
      <Box>
        <Box width={14}>
          <Text color={color("dim")}>Base</Text>
        </Box>
        <Text color={color("text")}>{sanitizeForDisplay(props.base)}</Text>
      </Box>

      {collision ? (
        <Box marginTop={1}>
          <Text color={color("danger")}>A branch named {name} already exists.</Text>
        </Box>
      ) : null}

      {props.commandPreview && slug && !collision ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>
            git switch --create {sanitizeForDisplay(name)} {sanitizeForDisplay(props.base)}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>
          {stage === "type"
            ? "←→ choose type   enter next   esc cancel"
            : `${glyphs.arrow} type description   enter create   tab back   esc cancel`}
        </Text>
      </Box>
    </Box>
  );
}
