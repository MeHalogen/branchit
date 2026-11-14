import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useColor, useTheme } from "../app/theme-context.js";
import { abbreviateHome, middleTruncate, relativeTime, sanitizeForDisplay } from "../utils/format.js";
import type { WorktreeInfo } from "../workflows/worktrees.js";

/**
 * Worktree manager: every checkout of this repository side by side, with its
 * branch, dirty state, ahead/behind and last activity. Built for running
 * several branches (or coding agents) at once.
 */
export function Worktrees(props: {
  worktrees: WorktreeInfo[];
  width: number;
  onOpen: (wt: WorktreeInfo) => void;
  onAddExisting: () => void;
  onAddNew: () => void;
  onRemove: (wt: WorktreeInfo) => void;
  onPrune: () => void;
  onClose: () => void;
  active?: boolean;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const [index, setIndex] = useState(0);
  const list = props.worktrees;
  const selected = list[Math.min(index, list.length - 1)];
  const stale = list.filter((w) => w.prunable || w.missing).length;

  useInput(
    (input, key) => {
      if (key.escape || input === "q") props.onClose();
      else if (key.upArrow || input === "k") setIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === "j") setIndex((i) => Math.min(list.length - 1, i + 1));
      else if (input === "a") props.onAddExisting();
      else if (input === "n") props.onAddNew();
      else if (input === "p" && stale > 0) props.onPrune();
      else if (!selected) return;
      else if (key.return && !selected.missing) props.onOpen(selected);
      else if (input === "d" && !selected.isMain && !selected.isCurrent) props.onRemove(selected);
    },
    { isActive: props.active ?? true },
  );

  const home = process.env["HOME"] ?? process.env["USERPROFILE"];

  return (
    <Box flexDirection="column" width={props.width} borderStyle="round" borderColor={color("primary")} paddingX={1}>
      <Box>
        <Text color={color("accent")} bold>
          Worktrees
        </Text>
        <Text color={color("dim")}>
          {"   "}
          {list.length} checkout{list.length === 1 ? "" : "s"}
          {stale ? ` · ${stale} stale` : ""}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {list.map((w, i) => {
          const sel = i === index;
          const state = w.missing
            ? { text: "missing", tone: "danger" as const }
            : w.dirtyCount === null
              ? { text: "?", tone: "dim" as const }
              : w.dirtyCount > 0
                ? { text: `${w.dirtyCount} changed`, tone: "warning" as const }
                : { text: "clean", tone: "success" as const };
          const sync =
            w.ahead === null ? "" : `${glyphs.ahead}${w.ahead} ${glyphs.behind}${w.behind ?? 0}`;
          return (
            <Box key={w.path} flexDirection="column">
              <Box>
                <Text color={sel ? color("primary") : color("dim")}>{sel ? glyphs.arrow : " "} </Text>
                <Box width={2}>
                  <Text color={color("success")}>{w.isCurrent ? glyphs.current : " "}</Text>
                </Box>
                <Box width={28}>
                  <Text color={sel ? color("text") : color("dim")} bold={sel} wrap="truncate-end">
                    {sanitizeForDisplay(w.branch ?? `(detached ${w.head?.slice(0, 7) ?? "?"})`)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text color={color(state.tone)}>{state.text}</Text>
                </Box>
                <Box width={9}>
                  <Text color={color("dim")}>{sync}</Text>
                </Box>
                <Box width={5}>
                  <Text color={color("dim")}>{w.lastActivity ? relativeTime(w.lastActivity) : ""}</Text>
                </Box>
                <Text color={color("dim")}>
                  {w.isMain ? "main " : ""}
                  {w.locked ? "locked " : ""}
                </Text>
              </Box>
              <Box marginLeft={4}>
                <Text color={color("dim")} wrap="truncate-end">
                  {sanitizeForDisplay(middleTruncate(abbreviateHome(w.path, home), props.width - 8))}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>
          enter open here   a add for branch   n new branch{" "}
          {selected && !selected.isMain && !selected.isCurrent ? "  d remove" : ""}
          {stale ? "   p prune" : ""}   esc close
        </Text>
      </Box>
    </Box>
  );
}
