import React from "react";
import { Box, Text } from "ink";
import type { RepoData } from "../app/loadRepo.js";
import { orderedLocalBranches } from "../app/loadRepo.js";
import { useColor, useTheme } from "../app/theme-context.js";
import { COMMANDS, type Command } from "../keys/registry.js";
import { BranchRow } from "../components/BranchRow.js";
import {
  abbreviateHome,
  repoNameFromRoot,
  sanitizeForDisplay,
} from "../utils/format.js";
import { homedir } from "node:os";

const IMPLEMENTED: ReadonlySet<string> = new Set([
  "dashboard.switchBranch",
  "dashboard.newBranch",
  "dashboard.fetch",
  "dashboard.sweep",
  "global.refresh",
  "global.help",
  "global.quit",
]);

const QUICK_ACTION_IDS: Command["id"][] = [
  "dashboard.switchBranch",
  "dashboard.commit",
  "dashboard.newBranch",
  "dashboard.sweep",
  "dashboard.fetch",
  "dashboard.prepare",
];

export function Dashboard(props: { data: RepoData; width: number }) {
  const { data, width } = props;
  const color = useColor();
  const { glyphs } = useTheme();
  const { state, status } = data;

  const wt = status.workingTree;
  const dirty = !wt.isClean;
  const repoName = repoNameFromRoot(state.rootPath);

  const current = data.branches.find((b) => b.kind === "local" && b.isCurrent);
  const up = current?.upstream ?? null;

  // Header right side: branch + ahead/behind, or special HEAD state.
  const headLabel = state.isUnborn
    ? "no commits yet"
    : state.isDetached
      ? `detached @ ${state.head?.shortSha ?? "?"}`
      : (state.currentBranch ?? "?");
  const abParts: string[] = [];
  if (up && !up.gone) {
    if (up.ahead > 0) abParts.push(`${glyphs.ahead}${up.ahead}`);
    if (up.behind > 0) abParts.push(`${glyphs.behind}${up.behind}`);
    if (up.ahead === 0 && up.behind === 0) abParts.push("synced");
  }

  const recents = orderedLocalBranches(data).slice(0, 6);
  const innerWidth = Math.max(20, width - 4);

  return (
    <Box flexDirection="column" width={width}>
      {/* Header */}
      <Box
        width={width}
        borderStyle="round"
        borderColor={color("border")}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Text color={color("accent")} bold>
            branchy
          </Text>
          <Text color={color("dim")}> {sanitizeForDisplay(repoName)}</Text>
        </Box>
        <Box>
          <Text
            color={state.isDetached ? color("warning") : color("primary")}
            bold
          >
            {sanitizeForDisplay(headLabel)}
          </Text>
          {abParts.length ? (
            <Text color={color("info")}> {abParts.join(" ")}</Text>
          ) : null}
        </Box>
      </Box>

      {/* Operation banner takes priority over normal workflow */}
      {state.operation !== "none" ? (
        <OperationBanner operation={state.operation} width={width} />
      ) : null}

      {/* Repository summary */}
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Box>
          <Text color={color("dim")}>Repository  </Text>
          <Text color={color("text")}>{sanitizeForDisplay(headLabel)}</Text>
          {up ? (
            <Text color={color("dim")}>
              {" "}
              {glyphs.arrow} {sanitizeForDisplay(up.ref)}
              {up.gone ? " (gone)" : ""}
            </Text>
          ) : !state.isDetached && !state.isUnborn ? (
            <Text color={color("dim")}> {glyphs.arrow} no upstream</Text>
          ) : null}
          <Text color={dirty ? color("warning") : color("success")}>
            {"   "}
            {dirty ? "changes" : "clean"}
          </Text>
        </Box>

        {/* Working tree counts */}
        <Box marginTop={1}>
          <Count label="staged" n={wt.staged.length} tone="success" />
          <Count label="modified" n={wt.unstaged.length} tone="warning" />
          <Count label="untracked" n={wt.untracked.length} tone="dim" />
          {wt.conflicted.length > 0 ? (
            <Count label="conflicted" n={wt.conflicted.length} tone="danger" />
          ) : null}
        </Box>
      </Box>

      {/* Quick actions */}
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text color={color("dim")}>Quick actions</Text>
        <Box flexWrap="wrap" marginTop={0}>
          {QUICK_ACTION_IDS.map((id) => {
            const cmd = COMMANDS.find((c) => c.id === id)!;
            const planned = !IMPLEMENTED.has(cmd.id);
            return (
              <Box key={cmd.id} width={Math.floor(innerWidth / 2)}>
                <Text color={color("primary")} bold>
                  [{cmd.shortcut}]
                </Text>
                <Text color={planned ? color("dim") : color("text")}>
                  {" "}
                  {cmd.title}
                  {planned ? " (soon)" : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Recent branches */}
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text color={color("dim")}>Recent branches</Text>
        {recents.length === 0 ? (
          <Text color={color("dim")}>No local branches yet.</Text>
        ) : (
          recents.map((b) => (
            <BranchRow key={b.id} branch={b} selected={false} width={innerWidth} />
          ))
        )}
      </Box>

      {/* Contextual suggestion */}
      <Suggestion data={data} width={width} />

      <Box paddingX={1} marginTop={1}>
        <Text color={color("dim")}>
          {abbreviateHome(state.rootPath, homedir())}
        </Text>
      </Box>
    </Box>
  );
}

function Count(props: {
  label: string;
  n: number;
  tone: "success" | "warning" | "dim" | "danger";
}) {
  const color = useColor();
  const active = props.n > 0;
  return (
    <Box marginRight={3}>
      <Text color={active ? color(props.tone as never) : color("dim")} bold={active}>
        {props.n}
      </Text>
      <Text color={color("dim")}> {props.label}</Text>
    </Box>
  );
}

function OperationBanner(props: {
  operation: string;
  width: number;
}) {
  const color = useColor();
  const label: Record<string, string> = {
    rebase: "Rebase in progress",
    merge: "Merge in progress",
    cherry_pick: "Cherry-pick in progress",
    revert: "Revert in progress",
    bisect: "Bisect in progress",
  };
  return (
    <Box
      width={props.width}
      borderStyle="round"
      borderColor={color("danger")}
      paddingX={1}
      marginTop={1}
    >
      <Text color={color("danger")} bold>
        {label[props.operation] ?? "Operation in progress"}
      </Text>
      <Text color={color("dim")}>
        {"  "}Resolve or abort it before other actions.
      </Text>
    </Box>
  );
}

function Suggestion(props: { data: RepoData; width: number }) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { data } = props;
  const wt = data.status.workingTree;
  const current = data.branches.find((b) => b.kind === "local" && b.isCurrent);

  let text: string | null = null;
  if (data.state.operation !== "none") text = null;
  else if (wt.conflicted.length > 0)
    text = `Resolve ${wt.conflicted.length} conflicted file(s)`;
  else if (current?.upstream && !current.upstream.gone && current.upstream.behind > 0)
    text = `Pull ${current.upstream.behind} commit(s) from ${current.upstream.ref}`;
  else if (wt.staged.length > 0) text = `Commit ${wt.staged.length} staged file(s)  (press c)`;
  else if (!wt.isClean) text = "Stage changes and commit  (press c)";

  if (!text) return null;
  return (
    <Box paddingX={1} marginTop={1}>
      <Text color={color("accent")}>{glyphs.bullet} </Text>
      <Text color={color("text")}>Suggested: {text}</Text>
    </Box>
  );
}
