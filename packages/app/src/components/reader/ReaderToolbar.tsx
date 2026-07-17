/**
 * ReaderToolbar — simplified toolbar for web mode
 */
import { ArrowLeft, List, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/stores/reader-store";
import { useAppStore } from "@/stores/app-store";

interface ReaderToolbarProps {
  tabId: string;
  isVisible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleToc: () => void;
  onToggleSettings: () => void;
}

export function ReaderToolbar({
  tabId,
  isVisible,
  onMouseEnter,
  onMouseLeave,
  onToggleToc,
  onToggleSettings,
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  const { setActiveTab } = useAppStore();
  const tab = useReaderStore((s) => s.tabs[tabId]);
  const canGoBack = useReaderStore((s) => s.canGoBack(tabId));
  const goBack = useReaderStore((s) => s.goBack);

  if (!tab) return null;

  return (
    <div
      className={`absolute left-0 right-0 top-2 z-40 flex h-10 items-center justify-between bg-background/95 backdrop-blur-sm px-2 shadow-sm transition-all duration-300 ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "-translate-y-[calc(100%+0.5rem)] opacity-0 pointer-events-none"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Left: back + TOC */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setActiveTab("home")}
          title={t("common.back")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>

        {canGoBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => goBack(tabId)}
            title={t("reader.goBackToPreviousLocation")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="mx-0.5 h-3.5 w-px bg-border/40" />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleToc}
          title={t("reader.toc")}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Center: chapter title */}
      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <span className="max-w-[200px] truncate text-xs text-foreground">
          {tab.chapterTitle || t("reader.untitled")}
        </span>
      </div>

      {/* Right: settings */}
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleSettings}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
