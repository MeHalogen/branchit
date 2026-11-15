import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useColor, useTheme } from "../app/theme-context.js";
import { parseDiff } from "../git/diff.js";
import type { StashEntry } from "../git/stash.js";
import { middleTruncate, relativeTime, sanitizeForDisplay } from "../utils/format.js";

/**
 * Stash manager: list, preview, apply, pop, drop (undoable), and turn a stash
 * into a branch. Nothing destructive happens without a confirm in the parent.
 */
export function StashScreen(props: {
  stashes: StashEntry[];
  width: number;
  loadPatch: (entry: StashEntry) => Promise<string>;
  onApply: (entry: StashEntry) => void;
  onPop: (entry: StashEntry) => void;
  onDrop: (entry: StashEntry) => void;
  onBranch: (entry: StashEntry) => void;
  onClose: () => void;
  active?: boolean;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const [index, setIndex] = useState(0);
  const [patch, setPatch] = useState<string | null>(null);
  const selected = props.stashes[Math.min(index, props.stashes.length - 1)];

  useEffect(() => {
    if (!selected) return;
    let live = true;
    setPatch(null);
    void props.loadPatch(selected).then((p) => {
      if (live) setPatch(p);
    });
    return () => {
      live = false;
    };
  }, [selected, props.loadPatch]);

  useInput(
    (input, key) => {
      if (key.escape || input === "q") props.onClose();
      else if (key.upArrow || input === "k") setIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === "j") setIndex((i) => Math.min(props.stashes.length - 1, i + 1));
      else if (!selected) return;
      else if (input === "a") props.onApply(selected);
      else if (input === "p") props.onPop(selected);
      else if (input === "d") props.onDrop(selected);
      else if (input === "b") props.onBranch(selected);
    },
    { isActive: props.active ?? true },
  );

  const files = patch ? parseDiff(patch) : [];
  const preview: { text: string; tone: Parameters<typeof color>[0] }[] = [];
  for (const f of files) {
    preview.push({ text: f.path, tone: "text" });
    for (const h of f.hunks) {
      for (const l of h.lines) {
        if (l.kind === "add") preview.push({ text: `  +${l.text}`, tone: "success" });
        else if (l.kind === "del") preview.push({ text: `  -${l.text}`, tone: "danger" });
      }
    }
  }

  return (
    <Box flexDirection="column" width={props.width} borderStyle="round" borderColor={color("primary")} paddingX={1}>
      <Text color={color("accent")} bold>
        Stashes
      </Text>
      {props.stashes.length === 0 ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>No stashes. Branchit offers to stash when a switch is blocked.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {props.stashes.slice(0, 10).map((s, i) => {
            const sel = i === index;
            return (
              <Box key={s.sha}>
                <Text color={sel ? color("primary") : color("dim")}>{sel ? glyphs.arrow : " "} </Text>
                <Box width={11}>
                  <Text color={color("info")}>{s.ref}</Text>
                </Box>
                <Box width={5}>
                  <Text color={color("dim")}>{relativeTime(s.at)}</Text>
                </Box>
                <Text color={sel ? color("text") : color("dim")} wrap="truncate-end">
                  {sanitizeForDisplay(middleTruncate(s.message, Math.max(20, props.width - 24)))}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
      {selected ? (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={color("dim")} paddingX={1}>
          {patch === null ? (
            <Text color={color("dim")}>Loading…</Text>
          ) : preview.length === 0 ? (
            <Text color={color("dim")}>(empty stash)</Text>
          ) : (
            preview.slice(0, 12).map((l, i) => (
              <Text key={i} color={color(l.tone)} wrap="truncate-end">
                {sanitizeForDisplay(l.text)}
              </Text>
            ))
          )}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={color("dim")}>
          {selected ? "a apply   p pop   b branch   d drop   " : ""}esc close
        </Text>
      </Box>
    </Box>
  );
}
