// import { SyncButton } from "@/components/ui/SyncButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/app-store";
import { useNotebookStore } from "@/stores/notebook-store";
import { useReaderStore } from "@/stores/reader-store";
import {
  ArrowLeft,
  List,
  RotateCcw,
  Settings,
  Undo,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TOCItem } from "./FoliateViewer";

interface ReaderToolbarProps {
  tabId: string;
  isVisible: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  tocItems?: TOCItem[];
  onGoToChapter?: (href: string) => void;
  onToggleToc?: () => void;
  onToggleSettings?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ReaderToolbar({
  tabId,
  isVisible,
  onPrev: _onPrev,
  onNext: _onNext,
  tocItems: _tocItems = [],
  onGoToChapter: _onGoToChapter,
  onToggleToc,
  onToggleSettings,
  onMouseEnter,
  onMouseLeave,
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const tab = useReaderStore((s) => s.tabs[tabId]);
  const canGoBack = useReaderStore((s) => s.canGoBack(tabId));
  const goBack = useReaderStore((s) => s.goBack);
  const { isOpen: isNotebookOpen, toggleNotebook } = useNotebookStore();


  const fixedLayoutZoomPercent = Math.round(fixedLayoutZoom * 100);
  const canZoomOut = fixedLayoutZoom > fixedLayoutZoomMin + 0.001;
  const canZoomIn = fixedLayoutZoom < fixedLayoutZoomMax - 0.001;
  const canResetZoom = Math.abs(fixedLayoutZoom - 1) > 0.001;


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
      {/* Left: back + history back + TOC + notebook */}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => goBack(tabId)}
                >
                  <Undo className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("reader.goBackToPreviousLocation")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

        {/* Notebook hidden */}
      </div>

      {/* Center: chapter title */}
      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <span className="max-w-[200px] truncate text-xs text-foreground">
          {tab.chapterTitle || t("reader.untitled")}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {/* SyncButton hidden */}
        {isFixedLayout && (
          <div
            className="mx-0.5 flex h-7 items-center gap-0.5 rounded-sm border border-border/50 bg-muted/40 px-0.5"
            aria-label={t("reader.pdfZoom")}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onFixedLayoutZoomChange?.(fixedLayoutZoom - fixedLayoutZoomStep)}
              disabled={!onFixedLayoutZoomChange || !canZoomOut}
              title={t("reader.zoomOut")}
              aria-label={t("reader.zoomOut")}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
              {fixedLayoutZoomPercent}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onFixedLayoutZoomChange?.(fixedLayoutZoom + fixedLayoutZoomStep)}
              disabled={!onFixedLayoutZoomChange || !canZoomIn}
              title={t("reader.zoomIn")}
              aria-label={t("reader.zoomIn")}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onFixedLayoutZoomChange?.(1)}
              disabled={!onFixedLayoutZoomChange || !canResetZoom}
              title={t("reader.resetZoom")}
              aria-label={t("reader.resetZoom")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {/* Search hidden */}
        {/* Pin hidden */}
        {/* Chat hidden */}
        {/* Fullscreen hidden */}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleSettings}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
