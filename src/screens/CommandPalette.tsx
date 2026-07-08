import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { COMMANDS, type Command, type CommandId } from "../keys/registry.js";
import { rankBranches } from "../search/rank.js";
import { useColor } from "../app/theme-context.js";
import { sanitizeForDisplay } from "../utils/format.js";

/**
 * Fuzzy command palette. Reuses the same ranking engine as the branch switcher
 * so search behavior is consistent. Unavailable commands are shown disabled
 * with a reason rather than hidden, which aids discovery.
 */
export function CommandPalette(props: {
  width: number;
  isAvailable: (id: CommandId) => { ok: boolean; reason?: string };
  onRun: (id: CommandId) => void;
  onClose: () => void;
}) {
  const color = useColor();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const ranked = useMemo(() => {
    // Rank on a synthetic string combining title + keywords for good recall.
    const items = COMMANDS.map((c) => ({
      name: `${c.title} ${c.keywords.join(" ")}`,
      cmd: c,
    }));
    const r = rankBranches(items, query);
    return r.map((m) => m.item.cmd) as Command[];
  }, [query]);

  const clamped = Math.min(index, Math.max(0, ranked.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      props.onClose();
      return;
    }
    if (key.return) {
      const cmd = ranked[clamped];
      if (cmd && props.isAvailable(cmd.id).ok) props.onRun(cmd.id);
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setIndex((i) => Math.min(i + 1, ranked.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIndex(0);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
      setIndex(0);
    }
  });

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("accent")}
      paddingX={1}
    >
      <Box>
        <Text color={color("accent")} bold>
          {"> "}
        </Text>
        <Text color={color("text")}>{sanitizeForDisplay(query)}</Text>
        <Text color={color("accent")}>▏</Text>
        {query === "" ? <Text color={color("dim")}>run a command…</Text> : null}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {ranked.length === 0 ? (
          <Text color={color("dim")}>No commands match.</Text>
        ) : (
          ranked.slice(0, 10).map((cmd, i) => {
            const sel = i === clamped;
            const avail = props.isAvailable(cmd.id);
            return (
              <Box key={cmd.id} width={props.width - 4}>
                <Box width={2}>
                  <Text color={color("primary")}>{sel ? ">" : " "}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text
                    color={avail.ok ? (sel ? color("primary") : color("text")) : color("dim")}
                    bold={sel}
                  >
                    {cmd.title}
                  </Text>
                  {!avail.ok && avail.reason ? (
                    <Text color={color("dim")}> — {avail.reason}</Text>
                  ) : null}
                </Box>
                <Box>
                  <Text color={color("dim")}>
                    {cmd.category}
                    {cmd.shortcut ? `  ${cmd.shortcut}` : ""}
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>↑↓ move   enter run   esc close</Text>
      </Box>
    </Box>
  );
}
