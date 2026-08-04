import { idbDelete, idbGet, idbGetAll, idbPut } from "./idb";
import type { Expense, SyncQueueItem } from "../types";

/**
 * Offline-first sync engine.
 *
 * Local writes go straight to IndexedDB and are mirrored into an outbox
 * (`syncQueue`). When connectivity returns the engine:
 *   1. Pushes every queued op to the remote adapter.
 *   2. Pulls records changed since the last sync clock and merges them
 *      last-writer-wins based on `updatedAt`.
 *
 * The adapter is pluggable. `DemoRemoteAdapter` simulates a backend using
 * localStorage so the whole pipeline works end-to-end without credentials.
 * Replace it with a Supabase/Firebase adapter (see ARCHITECTURE.md) and the
 * engine stays unchanged.
 */

export interface RemoteSyncAdapter {
  readonly name: string;
  /** Persist a batch of local records to the remote store (upsert). */
  push(records: Expense[]): Promise<void>;
  /** Delete records by id on the remote store. */
  delete(ids: string[]): Promise<void>;
  /** Fetch records changed since the given server clock. */
  pull(since: string): Promise<{ records: Expense[]; serverClock: string }>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  lastSyncedAt: string | null;
}

const META_LAST_SYNC = "lastSyncAt";
const META_SERVER_CLOCK = "serverClock";

async function getMeta(key: string): Promise<string | null> {
  const row = await idbGet<{ key: string; value: string }>("meta", key);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await idbPut("meta", { key, value });
}

async function readQueue(): Promise<SyncQueueItem[]> {
  return idbGetAll<SyncQueueItem>("syncQueue");
}

/**
 * Simulated remote using localStorage. Demonstrates the full push/pull/merge
 * lifecycle with zero infrastructure. Records live under a namespaced key so
 * clearing browser data also clears the "server".
 */
export class DemoRemoteAdapter implements RemoteSyncAdapter {
  readonly name = "demo-local";

  private read(): Record<string, Expense> {
    try {
      return JSON.parse(localStorage.getItem("expense-remote") ?? "{}");
    } catch {
      // localStorage can throw in sandboxed iframes / private mode.
      return {};
    }
  }

  private write(map: Record<string, Expense>): void {
    try {
      localStorage.setItem("expense-remote", JSON.stringify(map));
    } catch {
      // Ignore; the local IndexedDB copy remains the source of truth.
    }
  }

  async push(records: Expense[]): Promise<void> {
    await new Promise((r) => setTimeout(r, 60));
    const map = this.read();
    for (const rec of records) {
      if (rec.deleted) delete map[rec.id];
      else map[rec.id] = rec;
    }
    this.write(map);
  }

  async delete(ids: string[]): Promise<void> {
    await new Promise((r) => setTimeout(r, 60));
    const map = this.read();
    for (const id of ids) delete map[id];
    this.write(map);
  }

  async pull(
    since: string,
  ): Promise<{ records: Expense[]; serverClock: string }> {
    await new Promise((r) => setTimeout(r, 60));
    const all = Object.values(this.read());
    const changed = all.filter((r) => r.updatedAt > since);
    const serverClock = changed.length
      ? changed
          .map((r) => r.updatedAt)
          .sort()
          .at(-1) ?? since
      : since;
    return { records: changed, serverClock };
  }
}

/** No-op adapter for environments without localStorage (SSR, tests). */
export class NullRemoteAdapter implements RemoteSyncAdapter {
  readonly name = "null";
  async push(): Promise<void> {}
  async delete(): Promise<void> {}
  async pull(
    since: string,
  ): Promise<{ records: Expense[]; serverClock: string }> {
    return { records: [], serverClock: since };
  }
}

export class SyncEngine {
  private adapter: RemoteSyncAdapter;

  constructor(adapter?: RemoteSyncAdapter) {
    this.adapter = adapter ?? new DemoRemoteAdapter();
  }

  get adapterName(): string {
    return this.adapter.name;
  }

  async lastSyncedAt(): Promise<string | null> {
    return getMeta(META_LAST_SYNC);
  }

  async pendingCount(): Promise<number> {
    return (await readQueue()).length;
  }

  /** Push queued local mutations, then pull remote changes and merge. */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: 0,
      pulled: 0,
      failed: 0,
      lastSyncedAt: null,
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return result;

    // 1) Drain the outbox. Group by record id so only the last mutation per
    //    record is actually transmitted.
    const queue = await readQueue();
    const groups = new Map<string, SyncQueueItem[]>();
    for (const item of queue) {
      const list = groups.get(item.id) ?? [];
      list.push(item);
      groups.set(item.id, list);
    }
    for (const [queueId, items] of groups) {
      const last = items[items.length - 1];
      const record = last.payload as Expense;
      try {
        if (last.op === "delete") {
          await this.adapter.delete([record.id]);
          await idbDelete("expenses", record.id);
        } else {
          await this.adapter.push(items.map((i) => i.payload as Expense));
        }
        await idbDelete("syncQueue", queueId);
        result.pushed += items.length;
      } catch {
        // Leave the item in the queue; it will be retried on next sync.
        result.failed += items.length;
      }
    }

    // 2) Pull remote changes and merge last-writer-wins.
    const since = (await getMeta(META_SERVER_CLOCK)) ?? "1970-01-01T00:00:00.000Z";
    const pulled = await this.adapter.pull(since);
    let merged = 0;
    for (const remote of pulled.records) {
      const local = await idbGet<Expense>("expenses", remote.id);
      const winner =
        local && local.updatedAt >= remote.updatedAt ? local : remote;
      await idbPut("expenses", winner);
      merged += 1;
    }
    result.pulled = merged;
    await setMeta(META_SERVER_CLOCK, pulled.serverClock);

    const now = new Date().toISOString();
    await setMeta(META_LAST_SYNC, now);
    result.lastSyncedAt = now;
    return result;
  }
}

export const syncEngine = new SyncEngine();
