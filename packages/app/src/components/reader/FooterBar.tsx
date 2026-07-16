import { useReaderStore } from "@/stores/reader-store";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface FooterBarProps {
  tabId: string;
  totalPages: number;
  currentPage: number;
  isVisible: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSeek?: (fraction: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function FooterBar({
  tabId,
  totalPages,
  currentPage,
  isVisible,
  onPrev,
  onNext,
  onSeek,
  onMouseEnter,
  onMouseLeave,
}: FooterBarProps) {
  const { t: _t } = useTranslation();
  const tab = useReaderStore((s) => s.tabs[tabId]);

  const progress = tab?.progress ?? 0;
  const pct = Math.round(progress * 100);

  // Local slider value for smooth dragging (avoids snap-back)
  const [localSliderValue, setLocalSliderValue] = useState<number | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayPct = localSliderValue != null ? localSliderValue : pct;

  // Debounced progress seek (100ms like readest/anx-reader)
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleProgressSeek = useCallback(
    (value: number) => {
      setLocalSliderValue(value);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
      seekTimerRef.current = setTimeout(() => {
        onSeek?.(value / 100);
      }, 100);
      // Keep local value for 600ms after last interaction
      cooldownTimerRef.current = setTimeout(() => {
        setLocalSliderValue(null);
      }, 600);
    },
    [onSeek],
  );

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm shadow-[0_-1px_3px_rgba(0,0,0,0.05)] transition-all duration-300 ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Main footer bar */}
      <div className="flex h-10 items-center gap-3 px-3">
        {/* Left: prev button */}
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Progress slider */}
        {onSeek && (
          <div className="flex flex-1 items-center gap-2.5 min-w-0">
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-8 text-right">
              {displayPct}%
            </span>
            <div className="relative flex-1 h-7 flex items-center group">
              <div className="absolute inset-x-0 h-[3px] rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full transition-[width] duration-75"
                  style={{ width: `${displayPct}%` }}
                />
              </div>
              <input
                type="range"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                min={0}
                max={100}
                value={displayPct}
                onChange={(e) => handleProgressSeek(parseInt(e.target.value, 10))}
                aria-label="Jump to position"
              />
              <div
                className="absolute w-3 h-3 rounded-full bg-primary shadow-sm border-2 border-background transition-transform group-hover:scale-125 pointer-events-none"
                style={{ left: `calc(${displayPct}% - 6px)` }}
              />
            </div>
          </div>
        )}

        {/* Right: page info */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {totalPages > 0 ? `${currentPage} / ${totalPages}` : `${pct}%`}
          </span>
        </div>

        {/* Right: next button */}
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
