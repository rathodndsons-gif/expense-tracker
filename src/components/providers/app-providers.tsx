"use client";

import { useEffect } from "react";
import { useExpenseStore } from "@/store/expense-store";

/**
 * App bootstrap: hydrates the store from IndexedDB and registers the service
 * worker (so the PWA installs / works offline). Runs once on mount.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void useExpenseStore.getState().hydrate();
    void import("@/lib/currency").then((m) => m.refreshRates());
    if ("serviceWorker" in navigator) {
      // Wait for load so first render isn't delayed by SW registration.
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/expense-tracker/sw.js").catch(() => {
          // SW unavailable (e.g. insecure context) — app still works online.
        });
      });
    }
  }, []);

  return <>{children}</>;
}
