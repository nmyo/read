/**
 * Footnote detection and preview utilities
 */

export function isFootnoteMarkerText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // Single number, asterisk, or dagger
  return /^[\d*†‡§¶]+$/.test(trimmed) && trimmed.length <= 3;
}

export function getHrefFragmentId(href?: string | null): string | null {
  if (!href) return null;
  const hashIndex = href.indexOf("#");
  return hashIndex >= 0 ? href.slice(hashIndex + 1) : null;
}

export function findElementByFragmentId(doc: Document, fragmentId: string | null): Element | null {
  if (!fragmentId) return null;
  try {
    return doc.getElementById(fragmentId) || doc.querySelector(`[id="${fragmentId}"]`);
  } catch {
    return null;
  }
}

export function isFootnoteLikeElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "sup" || tag === "sub") return true;
  const role = element.getAttribute("role");
  if (role === "doc-noteref" || role === "doc-footnote") return true;
  const className = element.className || "";
  if (/footnote|endnote|noteref/i.test(className)) return true;
  return false;
}

export function isLikelyFootnoteLink(anchor: HTMLAnchorElement, href?: string | null): boolean {
  if (!href) return false;
  const fragmentId = getHrefFragmentId(href);
  if (!fragmentId) return false;
  const text = anchor.textContent || "";
  return isFootnoteMarkerText(text) || isFootnoteLikeElement(anchor);
}

export function getElementPreviewText(element: Element | Range | null): string {
  if (!element) return "";
  try {
    if (element instanceof Range) {
      return element instanceof Range ? (element.toString() || "").slice(0, 100) : (element.textContent || "").slice(0, 100);
    }
    return element instanceof Range ? (element.toString() || "").slice(0, 100) : (element.textContent || "").slice(0, 100);
  } catch {
    return "";
  }
}

export function getFootnotePreviewKey(anchor: HTMLAnchorElement, href?: string | null): string {
  const fragmentId = getHrefFragmentId(href) || "";
  const text = anchor.textContent || "";
  return `${fragmentId}:${text}`;
}

export interface FootnotePreview {
  key: string;
  text: string;
  x: number;
  y: number;
}

export function getAnchorPreviewPosition(
  anchor: HTMLAnchorElement,
  container: HTMLElement | null
): { x: number; y: number } | null {
  if (!container) return null;
  try {
    const rect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
    };
  } catch {
    return null;
  }
}
