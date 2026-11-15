import { Box, Text } from "ink";
import { useColor } from "../app/theme-context.js";

export interface Hint {
  key: string;
  label: string;
}

/**
 * Contextual footer showing the key hints relevant to the current screen.
 * Rendered as one text run so it wraps instead of squeezing keys away on
 * narrow terminals.
 */
export function StatusBar(props: { hints: Hint[]; width: number }) {
  const color = useColor();
  return (
    <Box width={props.width} paddingX={1}>
      <Text wrap="wrap">
        {props.hints.map((h, i) => (
          <Text key={h.key + i}>
            <Text color={color("primary")} bold>
              {h.key}
            </Text>
            <Text color={color("dim")}>
              {" "}
              {h.label}
              {i < props.hints.length - 1 ? "  " : ""}
            </Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
