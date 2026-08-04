"use client";

import { useCallback, useEffect, useState } from "react";
import { syncEngine } from "@/lib/db/sync";
import { useOnline } from "./use-online";

/**
 * Offline-first sync hook.
 *
 * Exposes connectivity, the outbox size, the last sync timestamp and a
 * `syncNow()` trigger (used by pull-to-refresh). It automatically drains the
 * outbox the moment the device comes back online.
 */
export function useOfflineSync() {
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await syncEngine.pendingCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (!online) return;
    setSyncing(true);
    try {
      const result = await syncEngine.sync();
      setLastSyncedAt(result.lastSyncedAt);
    } finally {
      await refreshPending();
      setSyncing(false);
    }
  }, [online, refreshPending]);

  useEffect(() => {
    refreshPending();
    syncEngine.lastSyncedAt().then(setLastSyncedAt);
  }, [refreshPending]);

  // Auto-sync when connectivity is restored.
  useEffect(() => {
    if (online) void syncNow();
  }, [online, syncNow]);

  return { online, syncing, pending, lastSyncedAt, syncNow };
}
