import React from "react";
import { Box, Text } from "ink";
import { useColor, useTheme } from "../app/theme-context.js";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastState {
  kind: ToastKind;
  message: string;
  /** Optional raw detail (e.g. git stderr) for an error toast. */
  detail?: string;
}

export function Toast(props: { toast: ToastState; width: number }) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { toast } = props;

  const glyph =
    toast.kind === "success"
      ? glyphs.check
      : toast.kind === "error"
        ? glyphs.cross
        : toast.kind === "warning"
          ? glyphs.warn
          : glyphs.bullet;
  const semantic =
    toast.kind === "success"
      ? "success"
      : toast.kind === "error"
        ? "danger"
        : toast.kind === "warning"
          ? "warning"
          : "info";

  return (
    <Box width={props.width} paddingX={1}>
      <Text color={color(semantic as never)} bold>
        {glyph}{" "}
      </Text>
      <Text color={color(semantic as never)}>{toast.message}</Text>
      {toast.detail ? (
        <Text color={color("dim")}> — {toast.detail}</Text>
      ) : null}
    </Box>
  );
}
