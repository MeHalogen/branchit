import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  sweepSummary,
  type SweepCandidate,
  type BranchClassification,
} from "../workflows/sweep.js";
import type { DeleteSpec } from "../git/actions.js";
import { useColor, useTheme } from "../app/theme-context.js";
import { middleTruncate, relativeTime, sanitizeForDisplay } from "../utils/format.js";

const CLASS_LABEL: Record<BranchClassification, string> = {
  safe_merged: "merged",
  squash_suspected: "likely squash-merged",
  remote_gone: "remote gone",
  unmerged: "unmerged",
  protected: "protected",
  unknown: "needs review",
};

/**
 * Stale-branch sweeper. Conservative by design: only proven-merged branches are
 * preselected, protected branches are shown but never selectable, and every row
 * states its classification and confidence. Deletion is delegated to the parent
 * (which confirms and executes) — this screen only expresses intent.
 */
export function Sweeper(props: {
  candidates: SweepCandidate[];
  base: string;
  width: number;
  onDelete: (specs: DeleteSpec[]) => void;
  onClose: () => void;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { candidates, base, width } = props;

  const { safe, review, protected: prot } = useMemo(
    () => sweepSummary(candidates),
    [candidates],
  );
  // Selectable rows: safe first, then review. Protected is display-only.
  const selectable = useMemo(() => [...safe, ...review], [safe, review]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.filter((c) => c.selected).map((c) => c.branch.id)),
  );
  const [cursor, setCursor] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const clamped = Math.min(cursor, Math.max(0, selectable.length - 1));
  const current = selectable[clamped];

  const toggle = (c: SweepCandidate | undefined) => {
    if (!c || c.deletionMode === "none") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.branch.id)) next.delete(c.branch.id);
      else next.add(c.branch.id);
      return next;
    });
  };

  useInput((input, key) => {
    if (key.escape) {
      props.onClose();
      return;
    }
    if (key.downArrow || input === "j")
      setCursor((i) => Math.min(i + 1, selectable.length - 1));
    else if (key.upArrow || input === "k") setCursor((i) => Math.max(i - 1, 0));
    else if (input === " ") toggle(current);
    else if (input === "a")
      setSelected(new Set(safe.map((c) => c.branch.id))); // all *safe* only
    else if (input === "A") setSelected(new Set());
    else if (key.tab) setShowDetails((v) => !v);
    else if (input === "d") {
      const specs = buildSpecs(selectable, selected);
      if (specs.length > 0) props.onDelete(specs);
    }
  });

  const selectedCount = selectable.filter((c) => selected.has(c.branch.id)).length;
  const innerWidth = Math.max(24, width - 4);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={color("accent")} bold>
          Branch Sweeper
        </Text>
        <Text color={color("dim")}>
          base {sanitizeForDisplay(base)}   {candidates.length} candidates   {selectedCount} selected
        </Text>
      </Box>

      {selectable.length === 0 ? (
        <Box marginTop={1}>
          <Text color={color("success")}>
            {glyphs.check} No stale branches. Everything is either merged-and-gone
            already or protected.
          </Text>
        </Box>
      ) : null}

      {safe.length > 0 ? (
        <Section title="SAFE TO DELETE" color={color("success")}>
          {safe.map((c) => (
            <CandidateRow
              key={c.branch.id}
              c={c}
              selected={selected.has(c.branch.id)}
              cursor={current?.branch.id === c.branch.id}
              width={innerWidth}
            />
          ))}
        </Section>
      ) : null}

      {review.length > 0 ? (
        <Section title="NEEDS REVIEW" color={color("warning")}>
          {review.map((c) => (
            <CandidateRow
              key={c.branch.id}
              c={c}
              selected={selected.has(c.branch.id)}
              cursor={current?.branch.id === c.branch.id}
              width={innerWidth}
            />
          ))}
        </Section>
      ) : null}

      {prot.length > 0 ? (
        <Section title="PROTECTED" color={color("dim")}>
          {prot.slice(0, 6).map((c) => (
            <Box key={c.branch.id}>
              <Box width={4}>
                <Text color={color("dim")}> </Text>
              </Box>
              <Box flexGrow={1}>
                <Text color={color("dim")}>{sanitizeForDisplay(c.branch.name)}</Text>
              </Box>
              <Text color={color("dim")}>{c.reasons[0] ?? "protected"}</Text>
            </Box>
          ))}
        </Section>
      ) : null}

      {showDetails && current ? (
        <CandidateDetails c={current} width={innerWidth} />
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>
          space toggle   a safe-all   A none   tab inspect   d delete   esc close
        </Text>
      </Box>
    </Box>
  );
}

function buildSpecs(
  selectable: SweepCandidate[],
  selected: Set<string>,
): DeleteSpec[] {
  return selectable
    .filter((c) => selected.has(c.branch.id) && c.deletionMode !== "none")
    .map((c) => ({
      name: c.branch.name,
      mode: c.deletionMode === "force" ? "force" : "safe",
      restoreSha: c.branch.lastCommit?.sha ?? null,
    }));
}

function Section(props: {
  title: string;
  color: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={props.color} bold>
        {props.title}
      </Text>
      {props.children}
    </Box>
  );
}

function CandidateRow(props: {
  c: SweepCandidate;
  selected: boolean;
  cursor: boolean;
  width: number;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { c, selected, cursor } = props;

  const box = c.deletionMode === "none" ? "  " : selected ? "[x]" : "[ ]";
  const marker = cursor ? glyphs.arrow : " ";
  const rel = c.branch.lastCommit ? relativeTime(c.branch.lastCommit.committedAt) : "";
  const label = CLASS_LABEL[c.classification];
  const labelColor =
    c.classification === "safe_merged"
      ? color("success")
      : c.classification === "unmerged"
        ? color("danger")
        : color("warning");

  const rightText = `${label}${c.confidence === "likely" ? "?" : ""}   ${rel}`;
  const nameWidth = Math.max(10, props.width - 6 - rightText.length - 2);

  return (
    <Box width={props.width}>
      <Box width={2}>
        <Text color={color("primary")}>{marker}</Text>
      </Box>
      <Box width={4}>
        <Text color={selected ? color("primary") : color("dim")}>{box} </Text>
      </Box>
      <Box width={nameWidth}>
        <Text color={cursor ? color("primary") : color("text")} bold={cursor} wrap="truncate">
          {middleTruncate(sanitizeForDisplay(c.branch.name), nameWidth)}
        </Text>
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={labelColor}>{label}{c.confidence === "likely" ? "?" : ""}</Text>
        {rel ? <Text color={color("dim")}>{"   " + rel}</Text> : null}
      </Box>
    </Box>
  );
}

function CandidateDetails(props: { c: SweepCandidate; width: number }) {
  const color = useColor();
  const { c } = props;
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderColor={color("border")}
      paddingX={1}
    >
      <Text color={color("text")} bold>
        {sanitizeForDisplay(c.branch.name)}
      </Text>
      <Text color={color("dim")}>
        {CLASS_LABEL[c.classification]} · confidence {c.confidence} · delete{" "}
        {c.deletionMode === "none" ? "not allowed" : `via git branch -${c.deletionMode === "safe" ? "d" : "D"}`}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={color("dim")}>Why:</Text>
        {c.reasons.map((r, i) => (
          <Text key={i} color={color("text")}>
            {"  · "}
            {r}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
