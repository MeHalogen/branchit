import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Branch } from "../git/models.js";
import type { RepoData } from "../app/loadRepo.js";
import { rankBranches } from "../search/rank.js";
import { BranchRow } from "../components/BranchRow.js";
import { useColor, useTheme } from "../app/theme-context.js";
import {
  absoluteTime,
  relativeTime,
  sanitizeForDisplay,
} from "../utils/format.js";

const WINDOW = 12;

interface Row {
  kind: "header" | "branch";
  label?: string;
  branch?: Branch;
  matched?: number[];
}

/**
 * Interactive, search-first branch switcher.
 *
 * Typing filters instantly; arrows (or Ctrl-n/Ctrl-p) move the selection.
 * Enter switches. Selecting a remote-only branch is delegated to the parent so
 * it can offer to create a local tracking branch with a command preview.
 */
export function BranchSwitcher(props: {
  data: RepoData;
  width: number;
  onSelect: (branch: Branch) => void;
  onClose: () => void;
  commandPreview: boolean;
}) {
  const { data, width } = props;
  const color = useColor();
  const { glyphs } = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const { rows, branchRows } = useMemo(() => {
    const withRank = (b: Branch) => ({
      name: b.name,
      recencyRank: data.recentRanks.get(b.name),
      isCurrent: b.isCurrent,
      branch: b,
    });
    const locals = data.branches.filter((b) => b.kind === "local").map(withRank);
    const remotes = data.branches.filter((b) => b.kind === "remote").map(withRank);
    const rankedLocal = rankBranches(locals, query);
    const rankedRemote = rankBranches(remotes, query);

    const out: Row[] = [];
    if (rankedLocal.length) {
      out.push({ kind: "header", label: "LOCAL" });
      for (const r of rankedLocal)
        out.push({ kind: "branch", branch: r.item.branch, matched: r.matchedIndices });
    }
    if (rankedRemote.length) {
      out.push({ kind: "header", label: "REMOTE" });
      for (const r of rankedRemote)
        out.push({ kind: "branch", branch: r.item.branch, matched: r.matchedIndices });
    }
    const bRows = out.filter((r) => r.kind === "branch");
    return { rows: out, branchRows: bRows };
  }, [data.branches, data.recentRanks, query]);

  // Clamp selection whenever the filtered list changes.
  const clampedIndex = Math.min(index, Math.max(0, branchRows.length - 1));
  const selectedBranch = branchRows[clampedIndex]?.branch;

  useInput((input, key) => {
    if (key.escape) {
      if (query.length > 0) {
        setQuery("");
        setIndex(0);
      } else {
        props.onClose();
      }
      return;
    }
    if (key.return) {
      if (selectedBranch) props.onSelect(selectedBranch);
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setIndex((i) => Math.min(i + 1, branchRows.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (key.tab) {
      setShowDetails((v) => !v);
      return;
    }
    if (key.ctrl && input === "u") {
      setQuery("");
      setIndex(0);
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIndex(0);
      return;
    }
    // Printable characters go to the search box.
    if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
      setIndex(0);
    }
  });

  const innerWidth = Math.max(24, width - 4);

  // Compute a scroll window around the current selection.
  const branchIdxToRowIdx: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === "branch") branchIdxToRowIdx.push(i);
  });
  const selectedRowIdx = branchIdxToRowIdx[clampedIndex] ?? 0;
  let start = Math.max(0, selectedRowIdx - Math.floor(WINDOW / 2));
  let end = Math.min(rows.length, start + WINDOW);
  start = Math.max(0, end - WINDOW);
  const windowRows = rows.slice(start, end);

  let runningBranchIdx = -1;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Box>
        <Text color={color("accent")} bold>
          Switch branch
        </Text>
      </Box>

      {/* Search box */}
      <Box marginTop={1}>
        <Text color={color("primary")}>{glyphs.bullet} </Text>
        <Text color={color("text")}>{sanitizeForDisplay(query)}</Text>
        <Text color={color("primary")}>▏</Text>
        {query.length === 0 ? (
          <Text color={color("dim")}>type to filter…</Text>
        ) : null}
      </Box>

      {/* Results */}
      <Box flexDirection="column" marginTop={1}>
        {branchRows.length === 0 ? (
          <Text color={color("dim")}>No branches match “{sanitizeForDisplay(query)}”.</Text>
        ) : (
          windowRows.map((r, i) => {
            if (r.kind === "header") {
              return (
                <Text key={`h-${i}-${r.label}`} color={color("dim")} bold>
                  {r.label}
                </Text>
              );
            }
            runningBranchIdx = branchRows.indexOf(r);
            const isSel = runningBranchIdx === clampedIndex;
            return (
              <BranchRow
                key={r.branch!.id}
                branch={r.branch!}
                selected={isSel}
                width={innerWidth}
                matchedIndices={r.matched}
              />
            );
          })
        )}
        {branchRows.length > WINDOW ? (
          <Text color={color("dim")}>
            {clampedIndex + 1}/{branchRows.length}
          </Text>
        ) : null}
      </Box>

      {/* Details panel */}
      {showDetails && selectedBranch ? (
        <BranchDetails branch={selectedBranch} width={innerWidth} />
      ) : null}

      {/* Command preview */}
      {props.commandPreview && selectedBranch ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>
            {selectedBranch.kind === "remote"
              ? `git switch --track ${sanitizeForDisplay(selectedBranch.name)}`
              : `git switch ${sanitizeForDisplay(selectedBranch.name)}`}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>
          {glyphs.arrow} enter switch   ↑↓ move   tab details   esc close
        </Text>
      </Box>
    </Box>
  );
}

function BranchDetails(props: { branch: Branch; width: number }) {
  const color = useColor();
  const b = props.branch;
  const line = (label: string, value: string) => (
    <Box>
      <Box width={14}>
        <Text color={color("dim")}>{label}</Text>
      </Box>
      <Text color={color("text")}>{sanitizeForDisplay(value)}</Text>
    </Box>
  );
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderColor={color("border")}
      paddingX={1}
    >
      {line("name", b.name)}
      {line("kind", b.kind)}
      {b.upstream
        ? line(
            "upstream",
            b.upstream.gone
              ? `${b.upstream.ref} (gone)`
              : `${b.upstream.ref}  ahead ${b.upstream.ahead}, behind ${b.upstream.behind}`,
          )
        : line("upstream", "none")}
      {b.lastCommit ? line("commit", `${b.lastCommit.shortSha}  ${b.lastCommit.subject}`) : null}
      {b.lastCommit ? line("author", b.lastCommit.authorName) : null}
      {b.lastCommit
        ? line(
            "date",
            `${relativeTime(b.lastCommit.committedAt)} ago  (${absoluteTime(b.lastCommit.committedAt)})`,
          )
        : null}
      {b.worktreePath ? line("worktree", b.worktreePath) : null}
    </Box>
  );
}
