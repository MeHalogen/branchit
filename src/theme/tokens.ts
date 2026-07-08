/**
 * Semantic color + glyph tokens.
 *
 * Components reference semantic names (success, danger, selected…) rather than
 * raw ANSI colors, so a no-color mode or alternate palette can be swapped in
 * one place. Colors are Ink `color` prop values.
 */
export interface Theme {
  primary: string;
  accent: string;
  muted: string;
  text: string;
  dim: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: string;
  selectedBg: string;
  selectedText: string;
}

export interface Glyphs {
  current: string;
  bullet: string;
  ahead: string;
  behind: string;
  remote: string;
  check: string;
  warn: string;
  cross: string;
  arrow: string;
  spinnerFrames: string[];
}

const unicodeGlyphs: Glyphs = {
  current: "●",
  bullet: "•",
  ahead: "↑",
  behind: "↓",
  remote: "",
  check: "✓",
  warn: "!",
  cross: "✗",
  arrow: "→",
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

const asciiGlyphs: Glyphs = {
  current: "*",
  bullet: "-",
  ahead: "+",
  behind: "-",
  remote: "@",
  check: "OK",
  warn: "!",
  cross: "x",
  arrow: "->",
  spinnerFrames: ["|", "/", "-", "\\"],
};

const colorTheme: Theme = {
  primary: "cyan",
  accent: "magenta",
  muted: "gray",
  text: "white",
  dim: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
  border: "gray",
  selectedBg: "cyan",
  selectedText: "black",
};

/** No-color theme: state is conveyed by text labels, never color alone. */
const noColorTheme: Theme = {
  primary: "",
  accent: "",
  muted: "",
  text: "",
  dim: "",
  success: "",
  warning: "",
  danger: "",
  info: "",
  border: "",
  selectedBg: "",
  selectedText: "",
};

export interface ThemeContextValue {
  theme: Theme;
  glyphs: Glyphs;
  noColor: boolean;
}

export function resolveTheme(opts: {
  noColor: boolean;
  ascii: boolean;
}): ThemeContextValue {
  return {
    theme: opts.noColor ? noColorTheme : colorTheme,
    glyphs: opts.ascii ? asciiGlyphs : unicodeGlyphs,
    noColor: opts.noColor,
  };
}
