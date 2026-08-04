"use client";

import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 56;
const MAX_PULL = 96;

/**
 * Custom pull-to-refresh for the iOS standalone feel.
 *
 * The app shell is a fixed `h-dvh overflow-hidden` root, so iOS's native
 * pull-to-refresh never triggers; this component reads touch deltas at
 * scroll-top and translates the content to reveal a refresh indicator.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  className?: string;
}) {
  const startY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const scroller = scrollRef.current;
    if (scroller && scroller.scrollTop <= 0 && e.touches.length === 1) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.45, MAX_PULL));
  };

  const handleTouchEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPull(0);
      });
    } else {
      setPull(0);
    }
  };

  return (
    <div className={cn("relative h-full overflow-hidden", className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3"
        style={{ transform: `translateY(${Math.max(pull - 8, 0)}px)` }}
        aria-hidden
      >
        <RefreshCw
          className={cn(
            "size-5 text-muted-foreground transition-opacity",
            (refreshing || pull > 8) && "opacity-100",
            refreshing && "animate-spin",
          )}
          style={{ opacity: refreshing || pull > 8 ? 1 : 0 }}
        />
      </div>
      <div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="h-full overflow-y-auto overscroll-contain"
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: pull === 0 ? "transform 0.25s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
