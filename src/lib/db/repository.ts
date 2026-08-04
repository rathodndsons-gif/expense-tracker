import { convertCurrency } from "../currency";
import { BASE_CURRENCY } from "../constants";
import type { Expense, ExpenseType, Subscription } from "../types";
import { idbGetAll, idbPut } from "./idb";

/**
 * Repository: the single source of truth for expense/subscription records.
 *
 * Every mutation:
 *   1. normalizes amounts into the base currency,
 *   2. persists to IndexedDB (synchronous from the UI's point of view),
 *   3. marks the record `dirty` so the sync engine can push it later.
 *
 * The Zustand store keeps an in-memory mirror of what lives here.
 */

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function makeExpense(
  input: Omit<
    Expense,
    "id" | "createdAt" | "updatedAt" | "deleted" | "dirty" | "amountBase"
  > & { id?: string; amountBase?: number },
): Expense {
  const now = new Date().toISOString();
  return {
    ...input,
    id: input.id ?? newId("exp"),
    amountBase:
      input.amountBase ??
      convertCurrency(input.amount, input.currency, BASE_CURRENCY),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    dirty: true,
  };
}

export function makeSubscription(
  input: Omit<
    Subscription,
    "id" | "createdAt" | "updatedAt" | "deleted" | "dirty" | "amountBase"
  > & { id?: string; amountBase?: number },
): Subscription {
  const now = new Date().toISOString();
  return {
    ...input,
    id: input.id ?? newId("sub"),
    amountBase:
      input.amountBase ??
      convertCurrency(input.amount, input.currency, BASE_CURRENCY),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    dirty: true,
  };
}

export async function getAllExpenses(): Promise<Expense[]> {
  return idbGetAll<Expense>("expenses");
}

export async function saveExpense(expense: Expense): Promise<void> {
  await idbPut("expenses", expense);
}

export async function getAllSubscriptions(): Promise<Subscription[]> {
  return idbGetAll<Subscription>("subscriptions");
}

export async function saveSubscription(subscription: Subscription): Promise<void> {
  await idbPut("subscriptions", subscription);
}

export function classifyType(merchant: string, note: string): ExpenseType {
  const text = `${merchant} ${note}`.toLowerCase();
  const incomeKeywords = [
    "salary", "paycheck", "payroll", "refund", "reimburse", "dividend",
    "interest", "freelance", "bonus", "income", "deposit", "received",
  ];
  return incomeKeywords.some((k) => text.includes(k)) ? "income" : "expense";
}
