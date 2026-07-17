/**
 * HomePage — 书库页面（只读，无管理功能）
 * 支持按格式分类显示：TXT 列表、EPUB 网格
 */
import { useLibraryStore } from "@/stores/library-store";
import type { Book, SortField } from "@readany/core/types";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  SortAsc,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookDetailsDialog } from "./BookDetailsDialog";
import { BookGrid } from "./BookGrid";

const SORT_OPTIONS: { field: SortField; labelKey: string }[] = [
  { field: "lastOpenedAt", labelKey: "library.sortRecent" },
  { field: "addedAt", labelKey: "library.sortAdded" },
  { field: "title", labelKey: "library.sortTitle" },
  { field: "author", labelKey: "library.sortAuthor" },
  { field: "progress", labelKey: "library.sortProgress" },
];

type CategoryTab = "txt" | "epub" | "all";

export function HomePage() {
  const { t } = useTranslation();
  const {
    books,
    filter,
    setFilter,
  } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<CategoryTab>("txt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailsBookId, setDetailsBookId] = useState<string | null>(null);
  const detailsBook = detailsBookId ? books.find(b => b.id === detailsBookId) ?? null : null;
  const handleShowDetails = useCallback((book: Book) => setDetailsBookId(book.id), []);

  // Reset page when tab changes
  const handleTabChange = useCallback((tab: CategoryTab) => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  const filtered = useMemo(() => {
    let result = books.filter((b) => {
      // Filter by category tab
      if (activeTab === "txt" && b.format !== "txt") return false;
      if (activeTab === "epub" && b.format !== "epub") return false;
      
      // Filter by search
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!b.meta.title.toLowerCase().includes(q) && !b.meta.author?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      const field = filter.sortField;
      const order = filter.sortOrder === "asc" ? 1 : -1;
      if (field === "title") return order * a.meta.title.localeCompare(b.meta.title);
      if (field === "author") return order * (a.meta.author || "").localeCompare(b.meta.author || "");
      if (field === "progress") return order * (a.progress - b.progress);
      if (field === "addedAt") return order * (a.addedAt - b.addedAt);
      if (field === "lastOpenedAt") return order * ((a.lastOpenedAt || 0) - (b.lastOpenedAt || 0));
      return 0;
    });
    return result;
  }, [books, filter.search, filter.sortField, filter.sortOrder, activeTab]);

  const handleSortChange = useCallback(
    (field: SortField) => {
      if (filter.sortField === field) {
        setFilter({ sortOrder: filter.sortOrder === "asc" ? "desc" : "asc" });
      } else {
        setFilter({ sortField: field, sortOrder: "asc" });
      }
    },
    [filter.sortField, filter.sortOrder, setFilter],
  );

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedBooks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const [showSortMenu, setShowSortMenu] = useState(false);

  // Count books by format
  const txtCount = useMemo(() => books.filter(b => b.format === "txt").length, [books]);
  const epubCount = useMemo(() => books.filter(b => b.format === "epub").length, [books]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold text-foreground">
          {t("home.library")}
        </h1>
        <div className="flex items-center gap-2">
          {/* Sort button */}
          <div className="relative">
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              onClick={() => setShowSortMenu(!showSortMenu)}
            >
              <SortAsc className="size-4" />
            </button>
            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSortMenu(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-lg border bg-popover p-1 shadow-lg">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.field}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors hover:bg-muted ${
                        filter.sortField === opt.field ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}
                      onClick={() => {
                        handleSortChange(opt.field);
                        setShowSortMenu(false);
                      }}
                    >
                      {filter.sortField === opt.field && (
                        filter.sortOrder === "asc" ? <ArrowUpAZ className="size-3" /> : <ArrowDownAZ className="size-3" />
                      )}
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-6 pb-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "txt"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => handleTabChange("txt")}
        >
          TXT ({txtCount})
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "epub"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => handleTabChange("epub")}
        >
          EPUB ({epubCount})
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => handleTabChange("all")}
        >
          全部 ({books.length})
        </button>
      </div>

      {/* Book list/grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length > 0 ? (
          activeTab === "txt" ? (
            /* TXT: Simple list view */
            <div className="divide-y divide-border">
              {paginatedBooks.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => handleShowDetails(book)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {book.meta.title}
                    </p>
                    {book.progress > 0 && (
                      <p className="text-xs text-muted-foreground">
                        已读 {Math.round(book.progress * 100)}%
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    TXT
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* EPUB/All: Grid view with covers */
            <BookGrid books={paginatedBooks} onShowDetails={handleShowDetails} />
          )
        ) : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <p>{t("library.empty", "书库为空")}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              共 {filtered.length} 本，第 {page}/{totalPages} 页
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={() => setPage(1)}
              disabled={page === 1}
            >
              首页
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
            >
              末页
            </button>
          </div>
        </div>
      )}

      {/* Book details dialog */}
      <BookDetailsDialog
        book={detailsBook}
        open={detailsBook !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsBookId(null);
        }}
      />
    </div>
  );
}