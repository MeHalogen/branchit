
import { Box, Text, useInput } from "ink";
import { useColor } from "../app/theme-context.js";
import { COMMANDS, shortcutFor } from "../keys/registry.js";

/** Contextual help. Shows the current screen's keys first, then global keys. */
export function HelpOverlay(props: {
  width: number;
  context: "dashboard" | "switcher";
  onClose: () => void;
}) {
  const color = useColor();
  useInput((_input, key) => {
    if (key.escape || _input === "?" || _input === "q") props.onClose();
  });

  const contextHelp =
    props.context === "switcher"
      ? [
          ["type", "filter branches"],
          ["↑ / ↓", "move selection"],
          ["enter", "switch to branch"],
          ["tab", "toggle details"],
          ["ctrl-u", "clear search"],
          ["esc", "clear search / close"],
        ]
      : [
          [":", "command palette (try: recover)"],
          ["?", "this help"],
          ["q", "quit"],
        ];

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("accent")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        Help — {props.context === "switcher" ? "Branch switcher" : "Dashboard"}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {contextHelp.map(([k, label]) => (
          <Box key={k}>
            <Box width={12}>
              <Text color={color("primary")} bold>
                {k}
              </Text>
            </Box>
            <Text color={color("text")}>{label}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={color("dim")}>Global</Text>
      </Box>
      <Box flexDirection="column">
        {COMMANDS.filter((c) => shortcutFor(c.id)).map((c) => (
          <Box key={c.id}>
            <Box width={12}>
              <Text color={color("primary")} bold>
                {shortcutFor(c.id)}
              </Text>
            </Box>
            <Text color={color("text")}>{c.title}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={color("dim")} bold>
          What does “merged” mean?
        </Text>
        <Text color={color("dim")}>
          Branchit verifies a branch tip is reachable from the base branch before
          offering Git&apos;s safe <Text color={color("text")}>-d</Text> deletion.
          It never force-deletes on a name or age heuristic.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={color("dim")}>esc close</Text>
      </Box>
    </Box>
  );
}
