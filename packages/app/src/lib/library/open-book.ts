import { useAppStore } from "@/stores/app-store";
import type { Book } from "@readany/core/types";

export async function openDesktopBook({
  book,
  initialCfi,
}: {
  book: Book;
  initialCfi?: string;
  [key: string]: any;
}): Promise<boolean> {
  // In web mode, check if book file is accessible via API
  if (book.id) {
    try {
      const res = await fetch(`/api/books/${book.id}/file`, { method: "HEAD" });
      if (!res.ok) {
        console.warn("[openBook] Book file not accessible via API:", book.filePath);
        return false;
      }
    } catch {
      console.warn("[openBook] Book file check failed:", book.filePath);
      return false;
    }
  }

  const { addTab, setActiveTab } = useAppStore.getState();
  const tabId = `reader-${book.id}`;
  addTab({
    id: tabId,
    type: "reader",
    title: book.meta.title,
    bookId: book.id,
    initialCfi,
  });
  setActiveTab(tabId);
  return true;
}
