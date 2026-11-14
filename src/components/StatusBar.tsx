
import { Box, Text } from "ink";
import { useColor } from "../app/theme-context.js";

export interface Hint {
  key: string;
  label: string;
}

/** Contextual footer showing the key hints relevant to the current screen. */
export function StatusBar(props: { hints: Hint[]; width: number }) {
  const color = useColor();
  return (
    <Box width={props.width} paddingX={1}>
      {props.hints.map((h, i) => (
        <Box key={h.key + i} marginRight={2}>
          <Text color={color("primary")} bold>
            {h.key}
          </Text>
          <Text color={color("dim")}> {h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
