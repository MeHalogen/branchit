import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useColor } from "../app/theme-context.js";

export interface ConfirmAction {
  key: string;
  label: string;
  tone?: "default" | "danger" | "primary";
}

/**
 * Generic confirmation / choice modal. Renders a title, an explanation, an
 * optional command preview, and a set of keyed actions. The parent decides
 * what each key does — this component only surfaces the choice safely.
 */
export function ConfirmModal(props: {
  title: string;
  lines: string[];
  commandPreview?: string[];
  actions: ConfirmAction[];
  width: number;
  danger?: boolean;
  onAction: (key: string) => void;
  onCancel: () => void;
}) {
  const color = useColor();
  const [, force] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel();
      return;
    }
    const match = props.actions.find((a) => a.key === input || (key.return && a.key === "enter"));
    if (match) {
      props.onAction(match.key);
      force((n) => n + 1);
    }
  });

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={props.danger ? color("danger") : color("primary")}
      paddingX={1}
    >
      <Text color={props.danger ? color("danger") : color("accent")} bold>
        {props.title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {props.lines.map((l, i) => (
          <Text key={i} color={color("text")}>
            {l}
          </Text>
        ))}
      </Box>
      {props.commandPreview && props.commandPreview.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color("dim")}>Command preview:</Text>
          {props.commandPreview.map((c, i) => (
            <Text key={i} color={color("dim")}>
              {"  "}
              {c}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        {props.actions.map((a) => (
          <Box key={a.key} marginRight={2}>
            <Text
              bold
              color={
                a.tone === "danger"
                  ? color("danger")
                  : a.tone === "primary"
                    ? color("primary")
                    : color("text")
              }
            >
              [{a.key === "enter" ? "enter" : a.key}]
            </Text>
            <Text color={color("dim")}> {a.label}</Text>
          </Box>
        ))}
        <Box marginRight={2}>
          <Text bold color={color("dim")}>
            [esc]
          </Text>
          <Text color={color("dim")}> cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
