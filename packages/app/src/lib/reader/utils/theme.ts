/**
 * Theme utilities for the reader
 */

export type AppTheme = "light" | "dark" | "sepia";

export interface ThemeColors {
  bg: string;
  fg: string;
  link: string;
}

export function getAppTheme(): AppTheme {
  if (typeof document === "undefined") return "light";
  const scheme = document.documentElement.style.getPropertyValue("color-scheme");
  if (scheme === "dark") return "dark";
  const bg = getComputedStyle(document.documentElement).backgroundColor;
  if (bg && /rgb\(\s*2[45]\d\s*,\s*2[34]\d\s*,\s*2[12]\d\s*\)/i.test(bg)) return "sepia";
  return "light";
}

export function getThemeColors(theme: AppTheme): ThemeColors {
  switch (theme) {
    case "dark":
      return { bg: "#1a1a1a", fg: "#e0e0e0", link: "#6db3f2" };
    case "sepia":
      return { bg: "#f4ecd8", fg: "#333", link: "#1a5276" };
    default:
      return { bg: "#fff", fg: "#333", link: "#0066cc" };
  }
}
