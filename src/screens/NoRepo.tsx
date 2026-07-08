import React from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useColor } from "../app/theme-context.js";
import { abbreviateHome } from "../utils/format.js";
import { homedir } from "node:os";

/** Polished empty state for when Branchy is launched outside a Git repo. */
export function NoRepo(props: { cwd: string; width: number }) {
  const color = useColor();
  const { exit } = useApp();
  useInput((input) => {
    if (input === "q") exit();
  });
  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("border")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        No Git repository found
      </Text>
      <Box marginTop={1}>
        <Text color={color("dim")}>{abbreviateHome(props.cwd, homedir())}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("text")}>Branchy works inside Git repositories.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>
          Run <Text color={color("text")}>git init</Text> here, or cd into a
          repository and start Branchy again.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>q quit</Text>
      </Box>
    </Box>
  );
}
