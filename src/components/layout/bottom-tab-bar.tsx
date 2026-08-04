"use client";

import {
  BarChart3,
  Home,
  Repeat,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/use-haptic";

export type TabId = "home" | "stats" | "subs" | "split" | "coach";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "subs", label: "Subs", icon: Repeat },
  { id: "split", label: "Split", icon: Users },
  { id: "coach", label: "Coach", icon: Sparkles },
];

export function BottomTabBar({
  active,
  onChange,
  pendingCount,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  pendingCount?: number;
}) {
  const haptic = useHaptic();

  return (
    <nav
      className="border-t bg-background/80 pb-safe backdrop-blur-xl"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                haptic("tap");
                onChange(id);
              }}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    "size-6 transition-transform duration-150",
                    isActive && "scale-105",
                  )}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                {id === "subs" && (pendingCount ?? 0) > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
