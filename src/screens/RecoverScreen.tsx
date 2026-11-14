import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useColor, useTheme } from "../app/theme-context.js";
import type { ReflogEntry } from "../git/recent.js";
import { middleTruncate, relativeTime, sanitizeForDisplay } from "../utils/format.js";

export interface ReflogPreview {
  branches: string[];
  stat: string[];
}

/**
 * Reflog time machine: every place HEAD has recently been, with a preview of
 * the commit and whether any branch still holds it. Restoring creates a new
 * branch at that commit — nothing is moved or overwritten.
 */
export function RecoverScreen(props: {
  entries: ReflogEntry[];
  width: number;
  loadPreview: (sha: string) => Promise<ReflogPreview>;
  onRestore: (entry: ReflogEntry) => void;
  onClose: () => void;
  /** False while a modal owns input. */
  active?: boolean;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const [index, setIndex] = useState(0);
  const [previews, setPreviews] = useState<Map<string, ReflogPreview>>(new Map());
  const visible = 10;
  const selected = props.entries[index];

  useEffect(() => {
    if (!selected || previews.has(selected.sha)) return;
    let live = true;
    void props.loadPreview(selected.sha).then((p) => {
      if (live) setPreviews((prev) => new Map(prev).set(selected.sha, p));
    });
    return () => {
      live = false;
    };
  }, [selected, previews, props.loadPreview]);

  useInput((input, key) => {
    if (key.escape || input === "q") props.onClose();
    else if (key.upArrow || input === "k") setIndex((i) => Math.max(0, i - 1));
    else if (key.downArrow || input === "j")
      setIndex((i) => Math.min(props.entries.length - 1, i + 1));
    else if (key.return && selected) props.onRestore(selected);
  }, { isActive: props.active ?? true });

  const start = Math.max(0, Math.min(index - Math.floor(visible / 2), props.entries.length - visible));
  const rows = props.entries.slice(start, start + visible);
  const preview = selected ? previews.get(selected.sha) : undefined;

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        Recover lost work
      </Text>
      <Text color={color("dim")}>Every place HEAD has been recently (the reflog).</Text>

      {props.entries.length === 0 ? (
        <Box marginTop={1}>
          <Text color={color("text")}>The reflog is empty.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {rows.map((e, i) => {
            const isSel = start + i === index;
            return (
              <Box key={`${e.sha}-${start + i}`}>
                <Text color={isSel ? color("primary") : color("dim")}>
                  {isSel ? glyphs.arrow : " "}{" "}
                </Text>
                <Box width={5}>
                  <Text color={color("dim")}>{relativeTime(e.at)}</Text>
                </Box>
                <Box width={9}>
                  <Text color={color("info")}>{e.sha.slice(0, 7)}</Text>
                </Box>
                <Text color={isSel ? color("text") : color("dim")}>
                  {sanitizeForDisplay(middleTruncate(e.action, Math.max(20, props.width - 22)))}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {selected ? (
        <Box flexDirection="column" marginTop={1}>
          {preview ? (
            <>
              <Text color={preview.branches.length ? color("dim") : color("warning")}>
                {preview.branches.length
                  ? `On: ${sanitizeForDisplay(preview.branches.slice(0, 4).join(", "))}`
                  : `${glyphs.warn} Not on any branch — only the reflog remembers this commit`}
              </Text>
              {preview.stat.map((l, i) => (
                <Text key={i} color={color("dim")}>
                  {sanitizeForDisplay(l)}
                </Text>
              ))}
            </>
          ) : (
            <Text color={color("dim")}>Loading preview…</Text>
          )}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>↑↓ move   enter restore as new branch   esc close</Text>
      </Box>
    </Box>
  );
}
