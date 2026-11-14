import { Text } from "ink";
import { useEffect, useState } from "react";
import { useColor, useTheme } from "../app/theme-context.js";

/**
 * Animated spinner from the theme's glyph frames (Unicode braille or ASCII).
 * Shows elapsed seconds after a moment so long fetches/pushes visibly progress.
 */
export function Spinner(props: { label?: string; showElapsed?: boolean }) {
  const color = useColor();
  const { glyphs } = useTheme();
  const [frame, setFrame] = useState(0);
  const [started] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), 80);
    return () => clearInterval(t);
  }, []);
  const frames = glyphs.spinnerFrames;
  const secs = Math.floor((Date.now() - started) / 1000);
  return (
    <Text>
      <Text color={color("primary")}>{frames[frame % frames.length]}</Text>
      {props.label ? <Text color={color("primary")}> {props.label}</Text> : null}
      {props.showElapsed !== false && secs >= 2 ? <Text color={color("dim")}> {secs}s</Text> : null}
    </Text>
  );
}
