
import { homedir } from "node:os";
import { Box, Text, useApp, useInput } from "ink";
import { useColor } from "../app/theme-context.js";
import { abbreviateHome } from "../utils/format.js";

/** Polished empty state for when Branchit is launched outside a Git repo. */
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
        <Text color={color("text")}>Branchit works inside Git repositories.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>
          Run <Text color={color("text")}>git init</Text> here, or cd into a
          repository and start Branchit again.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>q quit</Text>
      </Box>
    </Box>
  );
}
