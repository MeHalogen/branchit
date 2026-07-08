import React from "react";
import { Box, Text, useInput } from "ink";
import { useColor, useTheme } from "../app/theme-context.js";

/**
 * One-screen first-run onboarding. Short by design (no multi-step wizard):
 * names the core actions and gets out of the way.
 */
export function Welcome(props: { width: number; onStart: () => void }) {
  const color = useColor();
  const { glyphs } = useTheme();
  useInput((_input, key) => {
    if (key.return || key.escape) props.onStart();
  });

  const keys: [string, string][] = [
    ["b", "switch branch"],
    ["c", "commit"],
    ["s", "sweep merged branches"],
    ["p", "prepare a PR"],
    ["?", "help"],
  ];

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("accent")}
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text color={color("accent")} bold>
          {glyphs.bullet} Welcome to Branchy
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("text")}>
          A faster way to switch branches, clean merged work, write consistent
          commits, and prepare pull requests — without command archaeology.
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {keys.map(([k, label]) => (
          <Box key={k}>
            <Box width={4}>
              <Text color={color("primary")} bold>
                {k}
              </Text>
            </Box>
            <Text color={color("text")}>{label}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>
          Branchy shows the underlying git command before acting, and treats
          destructive actions carefully.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color("primary")} bold>
          enter
        </Text>
        <Text color={color("dim")}> start</Text>
      </Box>
    </Box>
  );
}
