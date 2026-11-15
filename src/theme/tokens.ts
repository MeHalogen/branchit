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

const catppuccinTheme: Theme = {
  primary: "#89b4fa",
  accent: "#cba6f7",
  muted: "#6c7086",
  text: "#cdd6f4",
  dim: "#7f849c",
  success: "#a6e3a1",
  warning: "#f9e2af",
  danger: "#f38ba8",
  info: "#89dceb",
  border: "#585b70",
  selectedBg: "#89b4fa",
  selectedText: "#1e1e2e",
};

const tokyoNightTheme: Theme = {
  primary: "#7aa2f7",
  accent: "#bb9af7",
  muted: "#565f89",
  text: "#c0caf5",
  dim: "#737aa2",
  success: "#9ece6a",
  warning: "#e0af68",
  danger: "#f7768e",
  info: "#7dcfff",
  border: "#3b4261",
  selectedBg: "#7aa2f7",
  selectedText: "#1a1b26",
};

const gruvboxTheme: Theme = {
  primary: "#83a598",
  accent: "#d3869b",
  muted: "#928374",
  text: "#ebdbb2",
  dim: "#a89984",
  success: "#b8bb26",
  warning: "#fabd2f",
  danger: "#fb4934",
  info: "#8ec07c",
  border: "#665c54",
  selectedBg: "#83a598",
  selectedText: "#282828",
};

export const THEME_NAMES = ["default", "catppuccin", "tokyo-night", "gruvbox", "none"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

const PALETTES: Record<Exclude<ThemeName, "none">, Theme> = {
  default: colorTheme,
  catppuccin: catppuccinTheme,
  "tokyo-night": tokyoNightTheme,
  gruvbox: gruvboxTheme,
};

export interface ThemeContextValue {
  theme: Theme;
  glyphs: Glyphs;
  noColor: boolean;
}

export function resolveTheme(opts: {
  noColor: boolean;
  ascii: boolean;
  name?: ThemeName;
}): ThemeContextValue {
  const noColor = opts.noColor || opts.name === "none";
  const name = opts.name && opts.name !== "none" ? opts.name : "default";
  return {
    theme: noColor ? noColorTheme : PALETTES[name],
    glyphs: opts.ascii ? asciiGlyphs : unicodeGlyphs,
    noColor,
  };
}
