/**
 * Core domain types for the Expense Tracker.
 *
 * All records are designed to be **offline-first**: they carry a monotonic
 * `updatedAt` timestamp and a `dirty` flag so the sync engine can replicate
 * local mutations to a remote store (e.g. Supabase) later, in a queue.
 */

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "INR"
  | "BRL"
  | "MXN";

export type ExpenseCategory =
  | "transport"
  | "food"
  | "groceries"
  | "housing"
  | "utilities"
  | "entertainment"
  | "shopping"
  | "health"
  | "travel"
  | "education"
  | "subscriptions"
  | "income"
  | "other";

export type ExpenseType = "expense" | "income";

export type SubscriptionCadence =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export interface SplitParticipant {
  /** Stable participant id (can be a local UUID until auth exists). */
  id: string;
  name: string;
  /** Share of the expense in the expense's own currency. */
  share: number;
}

export interface Split {
  participants: SplitParticipant[];
  /**
   * participantId -> expense id of the "settle up" record that paid them back.
   * Kept so the Split tab can render outstanding balances.
   */
  settledBy: Record<string, string>;
}

export interface Receipt {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface Expense {
  id: string;
  type: ExpenseType;
  amount: number;
  currency: CurrencyCode;
  /** Amount normalized into the user's base currency. */
  amountBase: number;
  category: ExpenseCategory;
  merchant: string;
  note: string;
  /** ISO date (yyyy-MM-dd) of the transaction. */
  date: string;
  /** ISO datetime the record was created (used for ordering + id generation). */
  createdAt: string;
  updatedAt: string;
  /** Soft delete so tombstones can propagate through sync. */
  deleted: boolean;
  /** Local change not yet pushed to the remote store. */
  dirty: boolean;
  split?: Split;
  receipt?: Receipt;
}

/** A recurring subscription / membership with renewal tracking. */
export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  amountBase: number;
  cadence: SubscriptionCadence;
  /** ISO date of the next billing date. */
  nextBilling: string;
  category: ExpenseCategory;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  dirty: boolean;
}

/** A unit of work queued locally until connectivity is restored. */
export interface SyncQueueItem<T = unknown> {
  id: string;
  op: "upsert" | "delete";
  entity: "expense" | "subscription";
  payload: T;
  queuedAt: string;
  attempts: number;
}

/** A chat message in the AI Financial Coach. */
export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CoachInsight {
  id: string;
  kind: "warning" | "tip" | "info" | "success";
  title: string;
  body: string;
}

/** Currency conversion table (base unit -> 1 USD). Static fallback rates. */
export type RatesMap = Partial<Record<CurrencyCode, number>>;
