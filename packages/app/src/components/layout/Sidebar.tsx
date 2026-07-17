import { Menu, Search, BookOpen } from "lucide-react";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/components/user/UserMenu";
import { useAppStore } from "@/stores/app-store";
import { useLibraryStore } from "@/stores/library-store";

interface HomeSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function HomeSidebar({ collapsed = false, onToggle }: HomeSidebarProps) {
  const { t } = useTranslation();
  const { activeTabId, setActiveTab } = useAppStore();
  const { filter, setFilter } = useLibraryStore();
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  // Determine which home sub-view is active
  const activeTab = useAppStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const activeType = activeTab?.type ?? "home";

  const handleNavClick = (_tabType?: string) => {
    setActiveTab("home");
  };

  const handleSearchClick = () => {
    if (collapsed) {
      // If collapsed, expand sidebar and show search
      onToggle?.();
      setTimeout(() => setIsSearchVisible(true), 200);
    } else {
      setIsSearchVisible(!isSearchVisible);
    }
  };

  return (
    <aside className={`z-40 flex h-full min-h-0 shrink-0 select-none flex-col overflow-hidden transition-all duration-200 ${collapsed ? 'w-12' : 'w-48 md:w-56 lg:w-64'}`}>
      {/* Toggle button */}
      <div className={`flex items-center ${collapsed ? 'justify-center py-2' : 'justify-between px-3 py-2'}`}>
        {!collapsed && (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("sidebar.library")}
          </span>
        )}
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          onClick={onToggle}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Collapsed state - icon buttons */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 py-2">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={handleSearchClick}
            title="搜索"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className={`rounded-md p-2 transition-colors ${
              activeType === "home" 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => handleNavClick("home")}
            title={t("sidebar.library")}
          >
            <BookOpen size={18} />
          </button>
          <div className="mt-auto">
            <UserMenu collapsed onExpand={onToggle} />
          </div>
        </div>
      )}

      {/* Expanded state */}
      {!collapsed && (<>
        {/* Search bar */}
        <div className="px-3 pb-2">
          {isSearchVisible ? (
            <div className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 transition-colors border border-transparent focus-within:border-primary/30">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder={`${t("common.search")}...`}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                value={filter.search}
                onChange={(e) => {
                  setFilter({ search: e.target.value });
                  if (e.target.value && activeType !== "home") setActiveTab("home");
                }}
                onBlur={() => {
                  if (!filter.search) setIsSearchVisible(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFilter({ search: "" });
                    setIsSearchVisible(false);
                  }
                }}
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={handleSearchClick}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="text-sm">{t("common.search")}</span>
            </button>
          )}
        </div>

        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
          <div className="space-y-0.5">
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeType === "home" 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => handleNavClick("home")}
            >
              <BookOpen size={16} className="shrink-0" />
              <span>{t("sidebar.library")}</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <UserMenu />
        </div>
      </>)}
    </aside>
  );
}
