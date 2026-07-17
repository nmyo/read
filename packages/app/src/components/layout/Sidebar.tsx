import {
  BookOpen,
  Menu,
} from "lucide-react";

import { useTranslation } from "react-i18next";
import { UserMenu } from "@/components/user/UserMenu";
import { useAppStore } from "@/stores/app-store";

interface HomeSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function HomeSidebar({ collapsed = false, onToggle }: HomeSidebarProps) {
  const { t } = useTranslation();
  const { activeTabId, setActiveTab } = useAppStore();

  // Determine which home sub-view is active
  const activeTab = useAppStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const activeType = activeTab?.type ?? "home";

  const handleNavClick = (_tabType?: string) => {
    setActiveTab("home");
  };

  return (
    <aside className={`z-40 flex h-full min-h-0 shrink-0 select-none flex-col overflow-hidden transition-all duration-200 ${collapsed ? 'w-10' : 'w-48'}`}>
      {/* Toggle button */}
      <div className={`flex items-center ${collapsed ? 'justify-center py-3' : 'justify-end px-2 py-1'}`}>
        <button
          type="button"
          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          onClick={onToggle}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <Menu size={20} />
        </button>
      </div>
      {!collapsed && (<>
        <nav className="flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto px-1 pt-2 pl-2">
          <div>
            <div className="flex w-full items-center">
              <button
                type="button"
                className={`flex flex-1 items-center gap-2 rounded-md p-1 py-1 text-left text-sm transition-colors hover:bg-muted ${activeType === "home" ? "text-foreground" : "text-muted-foreground"}`}
                onClick={() => handleNavClick("home")}
              >
                <div className="flex flex-1 items-center gap-2">
                  <BookOpen size={16} className="shrink-0" />
                  <span className="font-medium text-sm">{t("sidebar.library")}</span>
                </div>
              </button>
            </div>
          </div>
        </nav>
        <UserMenu />
      </>)}
    </aside>
  );
}
