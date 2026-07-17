import { useAppStore } from "@/stores/app-store";
import { useDownloadProgressStore } from "@/stores/download-progress-store";
import { useLibraryStore } from "@/stores/library-store";
import { setBookSyncStatus } from "@readany/core/db/database";
import { useSyncStore } from "@readany/core/stores/sync-store";
import { downloadBookFile } from "@readany/core/sync";
import { createSyncBackend } from "@readany/core/sync/sync-backend-factory";
import type { Book } from "@readany/core/types";
import type { TFunction } from "i18next";
import { toast } from "sonner";

interface OpenDesktopBookOptions {
  book: Book;
  t: TFunction;
  initialCfi?: string;
}





const pendingDownloads = new Set<string>();

function openReaderTab(book: Book, initialCfi?: string) {
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
}

export async function openDesktopBook({
  book,
  t,
  initialCfi,
}: OpenDesktopBookOptions): Promise<boolean> {
  const { books, setBooks, loadBooks } =
    useLibraryStore.getState();

  if (pendingDownloads.has(book.id) || book.syncStatus === "downloading") {
    return false;
  }

  if (book.syncStatus === "remote") {
    const syncStore = useSyncStore.getState();
    if (!syncStore.config) {
      toast.error(t("settings.syncNotConfigured"));
      return false;
    }

      const secretKey =
      syncStore.config.type === "webdav" ? "sync_webdav_password" : "sync_s3_secret_key";
    const password = await platform.kvGetItem(secretKey);
    if (!password) {
      toast.error(t("library.passwordNotFound", "未找到同步密码，请重新配置"));
      return false;
    }

    pendingDownloads.add(book.id);
    setBooks(
      books.map((item) => (item.id === book.id ? { ...item, syncStatus: "downloading" } : item)),
    );
    await setBookSyncStatus(book.id, "downloading");
    const { setProgress, clearProgress } = useDownloadProgressStore.getState();

    try {
      const backend = createSyncBackend(syncStore.config, password);
      const outcome = await downloadBookFile(backend, book.id, book.filePath, (progress) => {
        setProgress(book.id, progress.downloaded, progress.total);
      });
      await loadBooks();

      if (outcome === "not-found") {
        toast.error(
          t(
            "library.downloadNotFound",
            "远端没有这本书的文件，可能源设备还未上传成功。请回到那台设备重新打开/同步一次，或在此处重新导入。",
          ),
        );
        return false;
      }
      if (outcome === "error") {
        toast.error(t("library.downloadFailed", "下载失败，请重试"));
        return false;
      }
      return true;
    } catch (error) {
      console.error("[openDesktopBook] Failed to download remote book:", error);
      await setBookSyncStatus(book.id, "remote");
      await loadBooks();
      toast.error(t("library.downloadFailed", "下载失败，请重试"));
      return false;
    } finally {
      pendingDownloads.delete(book.id);
      clearProgress(book.id);
    }
  }


  // A soft-deleted book is no longer in the live store — even if its file
  // still exists on disk we must re-import it first so it rejoins the store.
  const isSoftDeleted = !!book.deletedAt;

  // In web mode, check if book file is accessible via API
  if (!isSoftDeleted && book.id) {
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

  // Skip local file operations in web mode
  let restoredBook: any = null;
  if (false) {
    // Dead code - kept for type compatibility
    if (!restoredBook) {
      toast.error(t("reader.reimportFailed", "重新导入失败，请稍后再试。"));
      return false;
    }

    toast.success(t("reader.reimportSuccess", "书籍已重新导入，笔记和阅读记录已恢复。"));
    openReaderTab(restoredBook, initialCfi);
    return true;
  }

  openReaderTab(book, initialCfi);
  return true;
}
