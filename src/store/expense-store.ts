import { create } from "zustand";
import { BASE_CURRENCY } from "@/lib/constants";
import {
  getAllExpenses,
  getAllSubscriptions,
  makeExpense,
  makeSubscription,
  saveExpense,
  saveSubscription,
} from "@/lib/db/repository";
import { idbPut } from "@/lib/db/idb";
import type { Expense, Subscription, SyncQueueItem } from "@/lib/types";

/**
 * Global store (Zustand).
 *
 * In-memory mirror of the IndexedDB repository. Every write persists to
 * IndexedDB immediately and enqueues a sync op, so the UI is fast, offline-
 * safe, and consistent.
 */

interface ExpenseStore {
  ready: boolean;
  baseCurrency: string;
  expenses: Expense[];
  subscriptions: Subscription[];

  hydrate: () => Promise<void>;
  addExpense: (
    input: Omit<
      Expense,
      "id" | "createdAt" | "updatedAt" | "deleted" | "dirty" | "amountBase"
    > & { id?: string; amountBase?: number },
  ) => Promise<Expense>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  softDeleteExpense: (id: string) => Promise<void>;
  restoreExpense: (id: string) => Promise<void>;
  hardDeleteExpense: (id: string) => Promise<void>;

  addSubscription: (
    input: Omit<
      Subscription,
      "id" | "createdAt" | "updatedAt" | "deleted" | "dirty" | "amountBase"
    > & { id?: string; amountBase?: number },
  ) => Promise<Subscription>;
  updateSubscription: (id: string, patch: Partial<Subscription>) => Promise<void>;
  toggleSubscription: (id: string) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
}

async function enqueueSync(
  record: Expense | Subscription,
  op: SyncQueueItem["op"],
): Promise<void> {
  const item: SyncQueueItem = {
    id: record.id,
    op,
    entity: "expense" in record && "merchant" in record ? "expense" : "subscription",
    payload: record,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await idbPut("syncQueue", item);
}

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  ready: false,
  baseCurrency: BASE_CURRENCY,
  expenses: [],
  subscriptions: [],

  hydrate: async () => {
    const [expenses, subscriptions] = await Promise.all([
      getAllExpenses(),
      getAllSubscriptions(),
    ]);
    set({
      ready: true,
      expenses: expenses.filter((e) => !e.deleted),
      subscriptions: subscriptions.filter((s) => !s.deleted),
    });
  },

  addExpense: async (input) => {
    const expense = makeExpense(input);
    await saveExpense(expense);
    await enqueueSync(expense, "upsert");
    set({ expenses: [...get().expenses, expense] });
    return expense;
  },

  updateExpense: async (id, patch) => {
    const current = get().expenses.find((e) => e.id === id);
    if (!current) return;
    const updated: Expense = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      dirty: true,
    };
    await saveExpense(updated);
    await enqueueSync(updated, "upsert");
    set({
      expenses: get().expenses.map((e) => (e.id === id ? updated : e)),
    });
  },

  softDeleteExpense: async (id) => {
    const current = get().expenses.find((e) => e.id === id);
    if (!current) return;
    const tombstone: Expense = {
      ...current,
      deleted: true,
      dirty: true,
      updatedAt: new Date().toISOString(),
    };
    await saveExpense(tombstone);
    await enqueueSync(tombstone, "upsert");
    set({ expenses: get().expenses.filter((e) => e.id !== id) });
  },

  restoreExpense: async (id) => {
    const restored = await getAllExpenses();
    const record = restored.find((e) => e.id === id);
    if (!record) return;
    const alive: Expense = {
      ...record,
      deleted: false,
      dirty: true,
      updatedAt: new Date().toISOString(),
    };
    await saveExpense(alive);
    await enqueueSync(alive, "upsert");
    set({ expenses: [...get().expenses, alive] });
  },

  hardDeleteExpense: async (id) => {
    const record = get().expenses.find((e) => e.id === id);
    await idbPut("syncQueue", {
      id,
      op: "delete",
      entity: "expense",
      payload: record ?? { id },
      queuedAt: new Date().toISOString(),
      attempts: 0,
    } satisfies SyncQueueItem);
    set({ expenses: get().expenses.filter((e) => e.id !== id) });
  },

  addSubscription: async (input) => {
    const sub = makeSubscription(input);
    await saveSubscription(sub);
    await enqueueSync(sub, "upsert");
    set({ subscriptions: [...get().subscriptions, sub] });
    return sub;
  },

  updateSubscription: async (id, patch) => {
    const current = get().subscriptions.find((s) => s.id === id);
    if (!current) return;
    const updated: Subscription = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      dirty: true,
    };
    await saveSubscription(updated);
    await enqueueSync(updated, "upsert");
    set({
      subscriptions: get().subscriptions.map((s) => (s.id === id ? updated : s)),
    });
  },

  toggleSubscription: async (id) => {
    const current = get().subscriptions.find((s) => s.id === id);
    if (!current) return;
    await get().updateSubscription(id, { active: !current.active });
  },

  deleteSubscription: async (id) => {
    const current = get().subscriptions.find((s) => s.id === id);
    if (!current) return;
    const tombstone: Subscription = {
      ...current,
      deleted: true,
      dirty: true,
      updatedAt: new Date().toISOString(),
    };
    await saveSubscription(tombstone);
    await enqueueSync(tombstone, "upsert");
    set({ subscriptions: get().subscriptions.filter((s) => s.id !== id) });
  },
}));
