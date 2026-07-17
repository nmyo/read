/**
 * Style utilities for the reader
 */

import { getAppTheme, getThemeColors } from "./theme";
import type { ViewSettings } from "@readany/core/types";

export const READER_OVERRIDE_STYLE_ID = "__readany_reader_override_style__";
export const REMOTE_FONT_LINK_ATTR = "data-readany-remote-font-link";

export function syncRemoteFontStylesInDocument(doc: Document, urls: string[] | undefined) {
  if (!urls || urls.length === 0) return;
  // Remove existing remote font links
  const existing = doc.querySelectorAll(`link[${REMOTE_FONT_LINK_ATTR}]`);
  existing.forEach((el) => el.remove());
  
  // Add new remote font links
  for (const url of urls) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute(REMOTE_FONT_LINK_ATTR, "true");
    doc.head.appendChild(link);
  }
}

export function syncRemoteFontStyles(view: any, settings: any) {
  const contents = view.getContents?.() ?? [];
  for (const { doc } of contents) {
    if (doc) {
      syncRemoteFontStylesInDocument(doc, settings.remoteFontUrls);
    }
  }
}

export function applyDocumentStyles(doc: Document, settings: ViewSettings) {
  const theme = getAppTheme();
  const colors = getThemeColors(theme);
  
  // Apply theme colors
  doc.documentElement.style.setProperty("--theme-bg-color", colors.bg);
  doc.documentElement.style.setProperty("--theme-fg-color", colors.fg);
  doc.documentElement.style.setProperty("--theme-link-color", colors.link);
}

export function getFontTheme(fontTheme?: string) {
  const themes: Record<string, { cjk: string; serif: string }> = {
    default: { cjk: "Noto Serif SC", serif: "Georgia" },
    song: { cjk: "SimSun", serif: "SimSun" },
    hei: { cjk: "SimHei", serif: "SimHei" },
    kai: { cjk: "KaiTi", serif: "KaiTi" },
  };
  return themes[fontTheme || "default"] || themes.default;
}
