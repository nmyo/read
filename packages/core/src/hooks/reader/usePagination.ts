/**
 * usePagination — handles page flip and scroll navigation via
 * mouse events from the host container and iframe bridge.
 *
 * Strategy: Leading-edge throttle with "idle unlock".
 */
import { useCallback, useEffect, useRef } from "react";
import type { FoliateView } from "./useFoliateView";

interface UsePaginationOptions {
  bookKey: string;
  viewRef: React.RefObject<FoliateView | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** Minimum cooldown after a page turn (ms) */
const WHEEL_MIN_COOLDOWN_MS = 350;

/** After the last wheel event, wait this long before unlocking (ms). */
const WHEEL_IDLE_MS = 200;

const WHEEL_LINE_HEIGHT = 16;

/** Lock window (ms) after a scrolled chapter turn settles, to avoid double-firing. */
const SCROLLED_TURN_UNLOCK_MS = 120;

const wheelDeltaToPixels = (delta: number, deltaMode = 0) => {
  if (deltaMode === 1) return delta * WHEEL_LINE_HEIGHT;
  if (deltaMode === 2) {
    const pageSize = typeof window === "undefined" ? 800 : window.innerHeight;
    return delta * pageSize;
  }
  return delta;
};

export function usePagination({ bookKey, viewRef, containerRef }: UsePaginationOptions) {
  const wheelLocked = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTime = useRef(0);
  const scrolledTurnLock = useRef(false);
  const scrolledTurnUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * In scrolled mode the browser handles all in-chapter scrolling natively.
   * We only intervene at the chapter boundary, mirroring readest/foliate's
   * native model: when the current gesture would pass the top or bottom edge,
   * hand the edge distance to prev/next so foliate opens the adjacent section.
   */
  const handleContinuousScroll = useCallback(
    (scrollDelta: number, threshold = 0) => {
      const view = viewRef.current;
      const renderer = view?.renderer;
      if (!view || !renderer?.scrolled) return false;
      if (scrolledTurnLock.current) return false;

      const start = Number(renderer.start ?? 0);
      const end = Number(renderer.end ?? 0);
      const viewSize = Number(renderer.viewSize ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(viewSize)) {
        return false;
      }

      const turn = (run: () => Promise<unknown> | undefined) => {
        scrolledTurnLock.current = true;
        Promise.resolve(run()).finally(() => {
          if (scrolledTurnUnlockTimer.current) clearTimeout(scrolledTurnUnlockTimer.current);
          scrolledTurnUnlockTimer.current = setTimeout(() => {
            scrolledTurnLock.current = false;
          }, SCROLLED_TURN_UNLOCK_MS);
        });
      };

      if (start <= scrollDelta && scrollDelta > threshold) {
        turn(() => viewRef.current?.prev(Math.ceil(start) + 1));
        return true;
      }

      if (Math.ceil(end) - scrollDelta >= viewSize && scrollDelta < -threshold) {
        const distance = Math.max(1, viewSize - Math.floor(end) + 1);
        turn(() => viewRef.current?.next(distance));
        return true;
      }

      return false;
    },
    [viewRef],
  );

  const handleScrolledWheel = useCallback(
    (deltaY: number, deltaX = 0, deltaMode = 0) => {
      const renderer = viewRef.current?.renderer;
      if (!renderer?.scrolled) return false;

      const pixelDeltaY = wheelDeltaToPixels(Number(deltaY) || 0, deltaMode);
      const pixelDeltaX = wheelDeltaToPixels(Number(deltaX) || 0, deltaMode);
      if (Math.abs(pixelDeltaY) < 2 && Math.abs(pixelDeltaX) < 2) return false;

      const scrollProp = String(renderer.scrollProp ?? "scrollTop");
      const scrollDelta =
        scrollProp === "scrollLeft"
          ? -(Math.abs(pixelDeltaX) > 0 ? pixelDeltaX : pixelDeltaY)
          : -pixelDeltaY;

      // Fire immediately so a boundary turn happens the moment we hit the edge.
      handleContinuousScroll(scrollDelta, 0);
      return true;
    },
    [handleContinuousScroll, viewRef],
  );

  const handleWheel = useCallback(
    (deltaY: number, deltaX?: number) => {
      const view = viewRef.current;
      if (!view) return;

      if (view.renderer?.scrolled) return;

      const absDY = Math.abs(deltaY);
      const absDX = Math.abs(deltaX || 0);
      if (absDY < 2 && absDX < 2) return;

      if (wheelLocked.current) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
          const elapsed = Date.now() - lockTime.current;
          if (elapsed >= WHEEL_MIN_COOLDOWN_MS) {
            wheelLocked.current = false;
          } else {
            idleTimer.current = setTimeout(() => {
              wheelLocked.current = false;
            }, WHEEL_MIN_COOLDOWN_MS - elapsed);
          }
        }, WHEEL_IDLE_MS);
        return;
      }

      let direction: "next" | "prev";
      if (absDY >= absDX) {
        direction = deltaY > 0 ? "next" : "prev";
      } else {
        direction = (deltaX || 0) > 0 ? "next" : "prev";
      }

      if (direction === "next") {
        view.next();
      } else {
        view.prev();
      }

      wheelLocked.current = true;
      lockTime.current = Date.now();
      idleTimer.current = setTimeout(() => {
        wheelLocked.current = false;
      }, WHEEL_IDLE_MS);
    },
    [viewRef],
  );

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (scrolledTurnUnlockTimer.current) {
        clearTimeout(scrolledTurnUnlockTimer.current);
        scrolledTurnUnlockTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data?.type || data.bookKey !== bookKey) return;

      switch (data.type) {
        case "iframe-wheel":
          if (viewRef.current?.renderer?.scrolled) {
            handleScrolledWheel(data.deltaY, data.deltaX, data.deltaMode);
            return;
          }
          handleWheel(data.deltaY, data.deltaX);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [bookKey, handleScrolledWheel, handleWheel, viewRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (viewRef.current?.renderer?.scrolled) {
        handleScrolledWheel(e.deltaY, e.deltaX, e.deltaMode);
        return;
      }
      e.preventDefault();
      handleWheel(e.deltaY, e.deltaX);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [containerRef, handleScrolledWheel, handleWheel, viewRef]);

  return { handleWheel, handleContinuousScroll };
}
