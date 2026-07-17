/**
 * Selection utilities for the reader
 */

export function getSelectionRange(selection?: Selection | null): Range | null {
  if (!selection || selection.isCollapsed) return null;
  try {
    return selection.getRangeAt(0);
  } catch {
    return null;
  }
}

export function getRangeTextWithoutRuby(range: Range, fallback = ""): string {
  try {
    const clone = range.cloneContents();
    // Remove ruby elements to get clean text
    const rubyEls = clone.querySelectorAll("ruby, rt, rp");
    rubyEls.forEach((el) => el.remove());
    return clone.textContent || fallback;
  } catch {
    return fallback;
  }
}

export function getSelectionEndRect(range: Range | null): DOMRect | null {
  if (!range) return null;
  try {
    const rect = range.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

export interface SelectionDragPoint {
  type: "touchstart" | "mousedown";
  x: number;
  y: number;
}

export function getSelectionAdvanceIntent(
  dragStart: SelectionDragPoint | null,
  event: { clientX: number; clientY: number; type: string }
): "advance" | "cancel" | null {
  if (!dragStart) return null;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // If moved enough, consider it an advance gesture
  if (distance > 10) return "advance";
  return null;
}
