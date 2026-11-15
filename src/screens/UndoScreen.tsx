import { Box, Text, useInput } from "ink";
import { useColor, useTheme } from "../app/theme-context.js";
import type { JournalEntry } from "../journal/journal.js";
import { entryLine, type UndoPlan } from "../journal/undo.js";
import { sanitizeForDisplay } from "../utils/format.js";

/**
 * Universal undo. Shows the last journaled operation and the exact inverse
 * commands before anything runs. Operations that cannot be undone (pushes,
 * or ones the repository has moved past) say so plainly.
 */
export function UndoScreen(props: {
  entry: JournalEntry | null;
  plan: UndoPlan | null;
  history: JournalEntry[];
  width: number;
  onConfirm: () => void;
  onClose: () => void;
  /** False while a modal owns input. */
  active?: boolean;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { entry, plan } = props;

  useInput((input, key) => {
    if (key.escape || input === "q") {
      props.onClose();
      return;
    }
    if (key.return && plan?.ok) props.onConfirm();
  }, { isActive: props.active ?? true });

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        Undo
      </Text>

      {!entry || !plan ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color("text")}>Nothing to undo yet.</Text>
          <Text color={color("dim")}>
            Branchit records switches, new branches, commits, stash-and-switch and branch
            deletions it performs, so each can be reversed here or with `branchit undo`.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color("text")}>{sanitizeForDisplay(entryLine(entry))}</Text>
          {plan.ok ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={color("dim")}>Will run:</Text>
              {plan.commands.map((c, i) => (
                <Text key={i} color={color("info")}>
                  {"  "}
                  {sanitizeForDisplay(c.display)}
                </Text>
              ))}
              {plan.warnings.map((w, i) => (
                <Text key={`w${i}`} color={color("warning")}>
                  {glyphs.warn} {sanitizeForDisplay(w)}
                </Text>
              ))}
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color={color("warning")}>
                {glyphs.warn} {sanitizeForDisplay(plan.reason)}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {props.history.length > 1 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color("dim")}>Earlier:</Text>
          {props.history.slice(1, 6).map((e) => (
            <Text key={e.id} color={color("dim")}>
              {"  "}
              {sanitizeForDisplay(entryLine(e))}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>{plan?.ok ? "enter undo   esc cancel" : "esc close"}</Text>
      </Box>
    </Box>
  );
}
