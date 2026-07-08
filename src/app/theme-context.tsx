import React, { createContext, useContext } from "react";
import type { ThemeContextValue } from "../theme/tokens.js";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider(props: {
  value: ThemeContextValue;
  children: React.ReactNode;
}) {
  return (
    <ThemeContext.Provider value={props.value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Helper: returns a color prop only when color is enabled, so no-color mode
 * naturally omits all coloring while keeping the same component tree.
 */
export function useColor() {
  const { theme, noColor } = useTheme();
  return (semantic: keyof typeof theme): string | undefined => {
    if (noColor) return undefined;
    return theme[semantic] || undefined;
  };
}
