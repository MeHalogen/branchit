import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { useColor } from "../app/theme-context.js";
import { rankBranches } from "../search/rank.js";
import { middleTruncate, sanitizeForDisplay } from "../utils/format.js";

export type SearchKind = "branch" | "command" | "commit" | "file";

export interface SearchItem {
  kind: SearchKind;
  /** Text matched against. */
  name: string;
  /** Shown dimmed on the right. */
  detail?: string;
  /** Opaque value handed back on pick (branch name, command id, sha, path). */
  value: string;
  recencyRank?: number;
}

/** Within a tier, branches and commands outrank files, files outrank commits. */
const BOOST: Record<SearchKind, number> = { branch: 40, command: 30, file: 10, commit: 0 };
const LABEL: Record<SearchKind, string> = {
  branch: "branch",
  command: "command",
  commit: "commit",
  file: "file",
};

/** One fuzzy box over branches, commands, recent commits and tracked files. */
export function SearchOverlay(props: {
  items: SearchItem[];
  width: number;
  onPick: (item: SearchItem) => void;
  onClose: () => void;
  active?: boolean;
}) {
  const color = useColor();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const ranked = useMemo(() => {
    const items = props.items.map((i) => ({ ...i, boost: BOOST[i.kind] }));
    return rankBranches(items, query).slice(0, 12);
  }, [props.items, query]);
  const clamped = Math.min(index, Math.max(0, ranked.length - 1));

  useInput(
    (input, key) => {
      if (key.escape) props.onClose();
      else if (key.return) {
        const hit = ranked[clamped];
        if (hit) props.onPick(hit.item);
      } else if (key.downArrow || (key.ctrl && input === "n"))
        setIndex((i) => Math.min(i + 1, ranked.length - 1));
      else if (key.upArrow || (key.ctrl && input === "p")) setIndex((i) => Math.max(i - 1, 0));
      else if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setIndex(0);
      } else if (input && !key.ctrl && !key.meta) {
        setQuery((q) => q + input);
        setIndex(0);
      }
    },
    { isActive: props.active ?? true },
  );

  return (
    <Box flexDirection="column" width={props.width} borderStyle="round" borderColor={color("accent")} paddingX={1}>
      <Box>
        <Text color={color("accent")} bold>
          {"/ "}
        </Text>
        <Text color={color("text")}>{sanitizeForDisplay(query)}</Text>
        <Text color={color("accent")}>▏</Text>
        {query === "" ? (
          <Text color={color("dim")}>search branches, commands, commits, files…</Text>
        ) : null}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {ranked.length === 0 ? (
          <Text color={color("dim")}>No matches.</Text>
        ) : (
          ranked.map((m, i) => {
            const sel = i === clamped;
            return (
              <Box key={`${m.item.kind}:${m.item.value}`} width={props.width - 4}>
                <Box width={2}>
                  <Text color={color("primary")}>{sel ? ">" : " "}</Text>
                </Box>
                <Box width={9}>
                  <Text color={color("dim")}>{LABEL[m.item.kind]}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={sel ? color("primary") : color("text")} bold={sel} wrap="truncate-end">
                    {sanitizeForDisplay(middleTruncate(m.item.name, Math.max(20, props.width - 30)))}
                  </Text>
                </Box>
                {m.item.detail ? (
                  <Text color={color("dim")}>{sanitizeForDisplay(m.item.detail)}</Text>
                ) : null}
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>↑↓ move   enter open   esc close</Text>
      </Box>
    </Box>
  );
}
