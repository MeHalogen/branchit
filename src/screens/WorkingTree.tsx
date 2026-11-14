import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { useColor, useTheme } from "../app/theme-context.js";
import { diffStat, type FileDiff } from "../git/diff.js";
import type { WorkingTreeState } from "../git/models.js";
import { middleTruncate, sanitizeForDisplay } from "../utils/format.js";

export type RowKind = "staged" | "unstaged" | "untracked" | "conflicted";

export interface FileRow {
  path: string;
  kind: RowKind;
}

export interface LoadedDiff {
  file: FileDiff | null;
  /** For untracked files: the file contents shown as additions. */
  untracked?: string[];
}

/** Flatten a working tree into rows; a file with staged and unstaged changes appears twice. */
export function workingTreeRows(wt: WorkingTreeState): FileRow[] {
  return [
    ...wt.conflicted.map((f) => ({ path: f.path, kind: "conflicted" as const })),
    ...wt.staged.map((f) => ({ path: f.path, kind: "staged" as const })),
    ...wt.unstaged.map((f) => ({ path: f.path, kind: "unstaged" as const })),
    ...wt.untracked.map((f) => ({ path: f.path, kind: "untracked" as const })),
  ];
}

const rowKey = (r: FileRow) => `${r.kind}:${r.path}`;

/**
 * Working tree + diff viewer. Files on top, the selected file's diff below.
 * space stages/unstages a file; in the diff, s/u stage or unstage the focused
 * hunk; x discards (stash-backed, so `u` on the dashboard can undo it).
 */
export function WorkingTree(props: {
  workingTree: WorkingTreeState;
  width: number;
  loadDiff: (row: FileRow) => Promise<LoadedDiff>;
  onToggle: (row: FileRow) => void;
  onHunk: (row: FileRow, file: FileDiff, hunkIndex: number) => void;
  onDiscard: (row: FileRow) => void;
  onClose: () => void;
  active?: boolean;
  /** Bumped by the parent after each change so diffs reload. */
  revision: number;
  /** Preselect this path (e.g. picked from search). */
  initialPath?: string | null;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const rows = useMemo(() => workingTreeRows(props.workingTree), [props.workingTree]);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    const initial = props.initialPath ? rows.find((r) => r.path === props.initialPath) : rows[0];
    return initial ? rowKey(initial) : null;
  });
  const [focus, setFocus] = useState<"files" | "diff">("files");
  const [hunk, setHunk] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [diff, setDiff] = useState<LoadedDiff | null>(null);

  const index = Math.max(
    0,
    rows.findIndex((r) => rowKey(r) === selectedKey),
  );
  const row = rows[index];

  // Keep the selection valid as rows change (e.g. a file moved to staged).
  useEffect(() => {
    if (row && rowKey(row) !== selectedKey) setSelectedKey(rowKey(row));
    if (!row) setSelectedKey(null);
  }, [row, selectedKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: props.revision forces a reload after staging changes
  useEffect(() => {
    if (!row) {
      setDiff(null);
      return;
    }
    let live = true;
    setDiff(null);
    void props.loadDiff(row).then((d) => {
      if (live) setDiff(d);
    });
    return () => {
      live = false;
    };
  }, [row, props.loadDiff, props.revision]);

  const hunks = diff?.file?.hunks ?? [];
  const hunkIdx = Math.min(hunk, Math.max(0, hunks.length - 1));

  useInput(
    (input, key) => {
      if (key.escape) {
        if (focus === "diff") setFocus("files");
        else props.onClose();
        return;
      }
      if (!row) return;
      if (focus === "files") {
        if (key.upArrow || input === "k") {
          const r = rows[Math.max(0, index - 1)];
          if (r) setSelectedKey(rowKey(r));
          setHunk(0);
          setScroll(0);
        } else if (key.downArrow || input === "j") {
          const r = rows[Math.min(rows.length - 1, index + 1)];
          if (r) setSelectedKey(rowKey(r));
          setHunk(0);
          setScroll(0);
        } else if (input === " ") {
          props.onToggle(row);
        } else if (key.return || key.tab) {
          setFocus("diff");
        } else if (input === "x" && row.kind !== "staged") {
          props.onDiscard(row);
        }
        return;
      }
      // Diff focus.
      if (input === "n" || key.downArrow || input === "j") {
        if (input === "n") {
          setHunk((h) => Math.min(hunks.length - 1, h + 1));
          setScroll(0);
        } else setScroll((s) => s + 1);
      } else if (input === "N" || key.upArrow || input === "k") {
        if (input === "N") {
          setHunk((h) => Math.max(0, h - 1));
          setScroll(0);
        } else setScroll((s) => Math.max(0, s - 1));
      } else if (input === "s" && row.kind === "unstaged" && diff?.file && hunks.length) {
        props.onHunk(row, diff.file, hunkIdx);
      } else if (input === "u" && row.kind === "staged" && diff?.file && hunks.length) {
        props.onHunk(row, diff.file, hunkIdx);
      } else if (key.tab) {
        setFocus("files");
      }
    },
    { isActive: props.active ?? true },
  );

  const kindMark: Record<RowKind, { mark: string; tone: Parameters<typeof color>[0] }> = {
    staged: { mark: "S", tone: "success" },
    unstaged: { mark: "M", tone: "warning" },
    untracked: { mark: "?", tone: "info" },
    conflicted: { mark: "!", tone: "danger" },
  };

  const listHeight = 8;
  const start = Math.max(0, Math.min(index - Math.floor(listHeight / 2), rows.length - listHeight));
  const paneHeight = 14;

  const diffLines: { text: string; tone: Parameters<typeof color>[0] }[] = [];
  if (diff?.untracked) {
    for (const l of diff.untracked) diffLines.push({ text: `+${l}`, tone: "success" });
  } else if (diff?.file?.binary) {
    diffLines.push({ text: "Binary file — no text diff.", tone: "dim" });
  } else if (diff?.file && hunks[hunkIdx]) {
    const h = hunks[hunkIdx]!;
    diffLines.push({ text: h.header, tone: "info" });
    for (const l of h.lines) {
      diffLines.push({
        text: l.kind === "meta" ? l.text : `${l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}${l.text}`,
        tone: l.kind === "add" ? "success" : l.kind === "del" ? "danger" : "dim",
      });
    }
  }
  const visibleDiff = diffLines.slice(scroll, scroll + paneHeight);
  const stat = diff?.file ? diffStat(diff.file) : null;

  const hint =
    focus === "files"
      ? `↑↓ file   space ${row?.kind === "staged" ? "unstage" : "stage"}   enter diff${row && row.kind !== "staged" ? "   x discard" : ""}   esc close`
      : `n/N hunk   ↑↓ scroll${row?.kind === "unstaged" ? "   s stage hunk" : row?.kind === "staged" ? "   u unstage hunk" : ""}   esc files`;

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Box>
        <Text color={color("accent")} bold>
          Working tree
        </Text>
        <Text color={color("dim")}>
          {"   "}
          {props.workingTree.staged.length} staged · {props.workingTree.unstaged.length} modified ·{" "}
          {props.workingTree.untracked.length} untracked
        </Text>
      </Box>

      {rows.length === 0 ? (
        <Box marginTop={1}>
          <Text color={color("success")}>
            {glyphs.check} Working tree clean — nothing to stage or discard.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {rows.slice(start, start + listHeight).map((r, i) => {
            const sel = start + i === index;
            const m = kindMark[r.kind];
            return (
              <Box key={rowKey(r)}>
                <Text color={sel ? color("primary") : color("dim")}>{sel ? glyphs.arrow : " "} </Text>
                <Box width={2}>
                  <Text color={color(m.tone)} bold>
                    {m.mark}
                  </Text>
                </Box>
                <Text color={sel ? color("text") : color("dim")} bold={sel && focus === "files"}>
                  {sanitizeForDisplay(middleTruncate(r.path, props.width - 10))}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {row ? (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={focus === "diff" ? color("primary") : color("dim")} paddingX={1}>
          <Text color={color("dim")}>
            {sanitizeForDisplay(row.path)} · {row.kind}
            {stat ? ` · +${stat.added} -${stat.removed}` : ""}
            {hunks.length > 1 ? ` · hunk ${hunkIdx + 1}/${hunks.length}` : ""}
          </Text>
          {diff === null ? (
            <Text color={color("dim")}>Loading diff…</Text>
          ) : visibleDiff.length === 0 ? (
            <Text color={color("dim")}>No textual changes.</Text>
          ) : (
            visibleDiff.map((l, i) => (
              <Text key={i} color={color(l.tone)} wrap="truncate-end">
                {sanitizeForDisplay(l.text)}
              </Text>
            ))
          )}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>{hint}</Text>
      </Box>
    </Box>
  );
}
