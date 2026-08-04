"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CloudUpload, Wifi, WifiOff } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { BottomTabBar, type TabId } from "@/components/layout/bottom-tab-bar";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { StatsView } from "@/components/analytics/stats-view";
import { SubscriptionsView } from "@/components/subs/subscriptions-view";
import { SplitView } from "@/components/split/split-view";
import { CoachView } from "@/components/coach/coach-view";
import { ExpenseInputSheet } from "@/components/expense/expense-input-sheet";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { useHaptic } from "@/hooks/use-haptic";
import { useExpenseStore } from "@/store/expense-store";

/**
 * The app shell: iOS-style fixed layout.
 *
 *  - Root is `h-dvh overflow-hidden` (no document scroll) so standalone mode
 *    feels native and our custom pull-to-refresh owns the gesture.
 *  - Safe-area padding via `pt-safe`/`pb-safe` utilities.
 *  - Tab content scrolls independently; the tab bar stays glued to the bottom.
 */
export function AppShell() {
  const { online, syncing, pending, syncNow } = useOfflineSync();
  const haptic = useHaptic();
  const ready = useExpenseStore((s) => s.ready);

  const [tab, setTab] = useState<TabId>("home");
  const [expenseOpen, setExpenseOpen] = useState(false);
  // Client-only after mount so SSR timestamps don't cause hydration mismatches.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Manifest shortcuts (/?action=add, /?tab=subs) deep-link into the app.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add") setExpenseOpen(true);
    const t = params.get("tab");
    if (t === "subs" || t === "stats" || t === "split" || t === "coach") {
      setTab(t);
    }
  }, []);

  const handleRefresh = async () => {
    await syncNow();
    haptic("success");
  };

  return (
    <div className="mx-auto flex h-app w-full max-w-md flex-col overflow-hidden">
      <header className="pt-safe bg-background/85 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 pb-2.5 pt-2.5">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Expense Tracker</h1>
            <p className="text-[11px] capitalize text-muted-foreground">
              {mounted ? format(new Date(), "EEEE, MMM d") : "\u00A0"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {!online && (
              <Badge variant="secondary">
                <WifiOff className="size-3" /> Offline
              </Badge>
            )}
            {pending > 0 && (
              <Badge variant="outline">
                <CloudUpload className="size-3" /> {pending}
              </Badge>
            )}
            {online && !syncing && (
              <Badge variant="secondary">
                <Wifi className="size-3 text-emerald-500" /> Synced
              </Badge>
            )}
            {syncing && (
              <CloudUpload className="size-4 animate-pulse text-muted-foreground" />
            )}
          </div>
        </div>
      </header>

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        {!ready ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>
        ) : tab === "home" ? (
          <DashboardView onAdd={() => setExpenseOpen(true)} />
        ) : tab === "stats" ? (
          <StatsView />
        ) : tab === "subs" ? (
          <SubscriptionsView />
        ) : tab === "split" ? (
          <SplitView />
        ) : (
          <CoachView />
        )}
      </PullToRefresh>

      <BottomTabBar active={tab} onChange={setTab} pendingCount={pending} />
      <ExpenseInputSheet open={expenseOpen} onOpenChange={setExpenseOpen} />
      <Toaster position="top-center" />
    </div>
  );
}
