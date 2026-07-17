import { GroupPickerPopover } from "@/components/home/GroupPickerPopover";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openDesktopBook } from "@/lib/library/open-book";
/**
 * BookCard — Readest-inspired book card with realistic cover rendering
 */
import { useAppStore } from "@/stores/app-store";
import { useDownloadProgressStore } from "@/stores/download-progress-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import type { Book } from "@readany/core/types";
import { getBookProgressPercent } from "@readany/core/utils";
import {
  Check,
  ChevronRight,
  FolderInput,
  FolderMinus,
  Hash,
  Info,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface BookCardProps {
  book: Book;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (bookId: string) => void;
  onShowDetails?: (book: Book) => void;
}

export const BookCard = memo(function BookCard({
  book,
  isSelectionMode,
  isSelected,
  onSelect,
  onShowDetails,
}: BookCardProps) {
  const { t } = useTranslation();
  const removeBook = useLibraryStore((s) => s.removeBook);
  const closeAppTab = useAppStore((s) => s.removeTab);
  const closeReaderTab = useReaderStore((s) => s.removeTab);
  const allTags = useLibraryStore((s) => s.allTags);
  const groups = useLibraryStore((s) => s.groups);
  const addGroup = useLibraryStore((s) => s.addGroup);
  const moveBookToGroup = useLibraryStore((s) => s.moveBookToGroup);
  const removeBookFromGroup = useLibraryStore((s) => s.removeBookFromGroup);
  const addTagToBook = useLibraryStore((s) => s.addTagToBook);
  const removeTagFromBook = useLibraryStore((s) => s.removeTagFromBook);
  const addTag = useLibraryStore((s) => s.addTag);
  const [showMenu, setShowMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [preserveDataOnDelete, setPreserveDataOnDelete] = useState(true);
  const coverRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const suppressOpenUntilRef = useRef(0);
  const progressPct = getBookProgressPercent(book.progress);
  const downloadProgress = useDownloadProgressStore((s) => s.progress[book.id]);

  const handleOpen = async () => {
    if (isSelectionMode) {
      onSelect?.(book.id);
      return;
    }
    if (
      showMenu ||
      showDeleteDialog ||
      Date.now() < suppressOpenUntilRef.current
    ) {
      return;
    }
    await openDesktopBook({ book, t });
  };

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    suppressOpenUntilRef.current = Date.now() + 600;
    setShowMenu(false);
    setMenuPos(null);
    setPreserveDataOnDelete(true);
    setShowDeleteDialog(true);
  }, []);


  const handleMoveGroup = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    suppressOpenUntilRef.current = Date.now() + 300;
    setShowMenu(false);
    setMenuPos(null);
    setShowGroupPicker(true);
  }, []);

  const handleShowDetails = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      suppressOpenUntilRef.current = Date.now() + 400;
      setShowMenu(false);
      setMenuPos(null);
      onShowDetails?.(book);
    },
    [book, onShowDetails],
  );




  return (
    <div
      className="group relative flex h-full cursor-pointer flex-col"
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void handleOpen();
        }
      }}
    >
      {/* Book card */}
      <div
        ref={coverRef}
        className={`relative aspect-[28/41] w-full overflow-hidden rounded transition-all duration-200 group-hover:shadow-md ${
          book.meta.coverUrl ? '' : 'flex items-center justify-center bg-gradient-to-b from-stone-100 to-stone-200 p-4'
        }`}
      >
        {/* Selection checkbox overlay */}
        {isSelectionMode && (
          <div
            className={`absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              isSelected ? "border-primary bg-primary" : "border-white bg-black/40"
            }`}
          >
            {isSelected && <Check className="h-3 w-3 text-white" />}
          </div>
        )}
        {isSelectionMode && isSelected && (
          <div className="absolute inset-0 z-10 rounded bg-black/15" />
        )}
        {/* Cover image or title */}
        {book.meta.coverUrl ? (
          <img
            src={`/api/covers/${book.meta.coverUrl.split('/').pop()}`}
            alt={book.meta.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="line-clamp-4 text-center font-serif text-base font-medium leading-snug text-stone-600">
              {book.meta.title}
            </span>
          </div>
        )}

        {/* Progress bar at bottom of cover */}
        {progressPct > 0 && progressPct < 100 && (
          <div className="absolute bottom-0 left-0 right-0 z-10 h-0.5 bg-black/10">
            <div
              className="h-full bg-primary/80 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}


        {/* Remote status overlay (on-demand download) */}
        {book.syncStatus === "remote" && (
          <div
            className="absolute inset-0 z-15 flex items-center justify-center rounded"
            style={{ backgroundColor: "rgba(59, 130, 246, 0.6)" }}
          >
            <div className="rounded bg-black/40 px-2 py-1 text-xs font-medium text-white">
              {t("home.remote", "需下载")}
            </div>
          </div>
        )}

        {/* Downloading status overlay */}
        {book.syncStatus === "downloading" && (
          <div className="absolute inset-0 z-15 flex flex-col items-center justify-center rounded bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
            <span className="mt-1.5 text-sm font-medium text-white">
              {t("home.downloading", "下载中")}
            </span>
            {downloadProgress && downloadProgress.total > 0 && (
              <span className="mt-0.5 text-xs text-white/80 tabular-nums">
                {Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%
              </span>
            )}
          </div>
        )}


        {/* Context menu trigger — hover only */}
        <button
          ref={menuBtnRef}
          type="button"
          className="absolute right-1 bottom-1 z-20 rounded-md bg-black/30 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            suppressOpenUntilRef.current = Date.now() + 300;
            if (showMenu) {
              setShowMenu(false);
              setMenuPos(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuPos({ x: rect.right, y: rect.top });
              setShowMenu(true);
            }
          }}
        >
          <MoreVertical className="h-3.5 w-3.5 text-white" />
        </button>
      </div>

      {/* Context menu — fixed position to avoid any overflow clipping */}
      {showMenu && menuPos && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              setShowTagMenu(false);
              setMenuPos(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                setShowMenu(false);
                setShowTagMenu(false);
                setMenuPos(null);
              }
            }}
          />
          <div
            className="fixed z-50 min-w-36 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ bottom: window.innerHeight - menuPos.y + 4, left: menuPos.x - 152 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {onShowDetails && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={handleShowDetails}
              >
                <Info className="h-3.5 w-3.5" />
                {t("library.detailsAction", "书籍详情")}
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted"
              onClick={handleMoveGroup}
            >
              <FolderInput className="h-3.5 w-3.5" />
              {book.groupId
                ? t("library.changeGroup", "更换分组")
                : t("library.moveToGroup", "移入分组")}
            </button>
            {book.groupId && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  suppressOpenUntilRef.current = Date.now() + 300;
                  setShowMenu(false);
                  setMenuPos(null);
                  removeBookFromGroup(book.id);
                }}
              >
                <FolderMinus className="h-3.5 w-3.5" />
                {t("library.removeFromGroup", "移出分组")}
              </button>
            )}
            {/* Tags submenu */}
            <div className="relative">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  suppressOpenUntilRef.current = Date.now() + 300;
                  setShowTagMenu(!showTagMenu);
                }}
              >
                <Hash className="h-3.5 w-3.5" />
                {t("home.manageTags")}
                <ChevronRight className="ml-auto h-3 w-3" />
              </button>
              {showTagMenu && (
                <div
                  className="absolute right-full top-0 z-50 mr-1 min-w-36 max-h-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {allTags.map((tag) => {
                    const hasTag = book.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          suppressOpenUntilRef.current = Date.now() + 300;
                          if (hasTag) removeTagFromBook(book.id, tag);
                          else addTagToBook(book.id, tag);
                        }}
                      >
                        <div
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${hasTag ? "border-primary bg-primary" : "border-border"}`}
                        >
                          {hasTag && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <span className="truncate">{tag}</span>
                      </button>
                    );
                  })}
                  {/* Quick add new tag */}
                  <div className="mt-1 border-t pt-1">
                    <div className="flex items-center gap-1 px-1">
                      <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <input
                        type="text"
                        className="w-full bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground"
                        placeholder={t("sidebar.tagPlaceholder")}
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter" && newTagInput.trim()) {
                            suppressOpenUntilRef.current = Date.now() + 300;
                            addTag(newTagInput.trim());
                            addTagToBook(book.id, newTagInput.trim());
                            setNewTagInput("");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Delete button */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.remove")}
            </button>
          </div>
        </>
      )}

      {/* Info area — minimal, below cover */}
      <div className="flex w-full flex-col pt-2">
        <h4 className="truncate text-xs font-semibold leading-tight text-foreground">
          {book.meta.title}
        </h4>
        {book.meta.author && (
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            {book.meta.author}
          </p>
        )}

        {/* Tag badges */}
        {book.tags.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            {book.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-muted px-1.5 py-px text-[9px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {book.tags.length > 2 && (
              <span className="text-[9px] text-muted-foreground">+{book.tags.length - 2}</span>
            )}
          </div>
        ) : (
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            <span className="inline-flex items-center rounded-full bg-muted/50 px-1.5 py-px text-[9px] text-muted-foreground">
              {t("sidebar.uncategorized")}
            </span>
          </div>
        )}

        {/* Status row */}
        <div className="mt-0.5 flex items-center justify-between" style={{ minHeight: "14px" }}>
          {progressPct > 0 && progressPct < 100 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">{progressPct}%</span>
          ) : progressPct >= 100 ? (
            <span className="text-[10px] font-medium text-green-600">{t("home.complete")}</span>
          ) : (
            <span className="inline-block rounded-full bg-primary/8 px-1.5 py-px text-[9px] font-medium text-primary">
              {t("home.new")}
            </span>
          )}

          {/* Format badge — subtle, right-aligned */}
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
            {book.format || "epub"}
          </span>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("library.deleteBookTitle", "删除这本书？")}</DialogTitle>
            <DialogDescription>
              {t(
                "library.deleteBookDescription",
                "你可以选择保留笔记和阅读统计，之后重新导入同一本书时会继续接上。",
              )}
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer items-start gap-3 px-1 py-1">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={preserveDataOnDelete}
              onChange={(e) => setPreserveDataOnDelete(e.target.checked)}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {t("library.preserveDeleteDataLabel", "保留笔记和阅读统计")}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  "library.preserveDeleteDataHint",
                  "勾选后会从书架移除书籍文件，但保留笔记、高亮和阅读历史，重新导入时可恢复。",
                )}
              </div>
            </div>
          </label>

          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t("common.cancel", "取消")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              onClick={async () => {
                suppressOpenUntilRef.current = Date.now() + 600;
                setShowDeleteDialog(false);
                // Close any open reader tabs BEFORE removing the book from store,
                // otherwise ReaderView will briefly render an error page.
                const matchingTabIds = useAppStore
                  .getState()
                  .tabs.filter((tab) => tab.bookId === book.id)
                  .map((tab) => tab.id);
                for (const tabId of matchingTabIds) {
                  closeAppTab(tabId);
                  closeReaderTab(tabId);
                }
                await removeBook(book.id, { preserveData: preserveDataOnDelete });
              }}
            >
              {t("common.remove", "删除")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {showGroupPicker && (
        <GroupPickerPopover
          groups={groups}
          currentGroupId={book.groupId}
          onSelect={(groupId) => {
            if (groupId) {
              moveBookToGroup(book.id, groupId);
            } else {
              removeBookFromGroup(book.id);
            }
          }}
          onCreateGroup={async (name) => {
            const group = await addGroup(name);
            if (group) moveBookToGroup(book.id, group.id);
          }}
          onClose={() => setShowGroupPicker(false)}
        />
      )}
    </div>
  );
});
