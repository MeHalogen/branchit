import React from "react";
import { Box, Text } from "ink";
import type { Branch } from "../git/models.js";
import { useColor, useTheme } from "../app/theme-context.js";
import { middleTruncate, relativeTime, sanitizeForDisplay } from "../utils/format.js";

/** One-line branch summary used by the switcher and dashboard lists. */
export function BranchRow(props: {
  branch: Branch;
  selected: boolean;
  width: number;
  matchedIndices?: number[];
}) {
  const { glyphs } = useTheme();
  const color = useColor();
  const { branch, selected, width } = props;

  // Compose the right-aligned metadata (upstream state + relative time).
  const meta: string[] = [];
  if (branch.upstream) {
    if (branch.upstream.gone) meta.push("remote gone");
    else {
      const parts: string[] = [];
      if (branch.upstream.ahead > 0) parts.push(`${glyphs.ahead}${branch.upstream.ahead}`);
      if (branch.upstream.behind > 0) parts.push(`${glyphs.behind}${branch.upstream.behind}`);
      meta.push(parts.length ? parts.join(" ") : "synced");
    }
  } else if (branch.kind === "local") {
    meta.push("no upstream");
  }
  if (branch.worktreePath) meta.push("worktree");
  const rel = branch.lastCommit ? relativeTime(branch.lastCommit.committedAt) : "";
  const metaText = meta.join("  ");

  const marker = branch.isCurrent ? glyphs.current : selected ? glyphs.arrow : " ";
  const name = sanitizeForDisplay(branch.name);

  // Reserve space for marker (2), metadata and time on the right.
  const rightText = [metaText, rel].filter(Boolean).join("  ");
  const rightWidth = rightText.length;
  const nameWidth = Math.max(8, width - 2 - rightWidth - 2);
  const shownName = middleTruncate(name, nameWidth);

  const nameColor = branch.isCurrent
    ? color("success")
    : selected
      ? color("primary")
      : color("text");

  return (
    <Box width={width}>
      <Box width={2}>
        <Text color={color("primary")}>{marker} </Text>
      </Box>
      <Box width={nameWidth}>
        <Text color={nameColor} bold={selected || branch.isCurrent} wrap="truncate">
          {shownName}
        </Text>
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={metaColorFor(branch, color)}>{metaText}</Text>
        {rel ? <Text color={color("dim")}>{"  " + rel}</Text> : null}
      </Box>
    </Box>
  );
}

function metaColorFor(
  branch: Branch,
  color: ReturnType<typeof useColor>,
): string | undefined {
  if (branch.upstream?.gone) return color("warning");
  if (branch.upstream && branch.upstream.behind > 0) return color("warning");
  if (branch.upstream && branch.upstream.ahead > 0) return color("info");
  if (branch.kind === "local" && !branch.upstream) return color("dim");
  return color("dim");
}
