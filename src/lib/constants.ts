import type { CurrencyCode, ExpenseCategory } from "./types";

/** The user's single base currency used for analytics + conversions. */
export const BASE_CURRENCY: CurrencyCode = "USD";

export const APP_NAME = "Expense Tracker";

export const APP_VERSION = "1.0.0";

/** Number of decimal places to round amounts to. */
export const MONEY_DECIMALS = 2;

/** Auto-conversion rates cached for the current session (1 unit -> base). */
export const STATIC_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150.5,
  CAD: 1.37,
  AUD: 1.52,
  CHF: 0.88,
  INR: 83.2,
  BRL: 5.05,
  MXN: 17.2,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  CHF: "Fr",
  INR: "₹",
  BRL: "R$",
  MXN: "MX$",
};

export const CURRENCIES = Object.keys(STATIC_RATES) as CurrencyCode[];

export interface CategoryMeta {
  id: ExpenseCategory;
  label: string;
  emoji: string;
  /** Default budget per month in base currency (used by the AI Coach). */
  defaultBudget: number;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "transport", label: "Transport", emoji: "🚗", defaultBudget: 300 },
  { id: "food", label: "Food & Drink", emoji: "🍔", defaultBudget: 400 },
  { id: "groceries", label: "Groceries", emoji: "🛒", defaultBudget: 350 },
  { id: "housing", label: "Housing", emoji: "🏠", defaultBudget: 1400 },
  { id: "utilities", label: "Utilities", emoji: "💡", defaultBudget: 200 },
  { id: "entertainment", label: "Fun", emoji: "🎬", defaultBudget: 150 },
  { id: "shopping", label: "Shopping", emoji: "🛍️", defaultBudget: 250 },
  { id: "health", label: "Health", emoji: "💊", defaultBudget: 120 },
  { id: "travel", label: "Travel", emoji: "✈️", defaultBudget: 300 },
  { id: "education", label: "Education", emoji: "📚", defaultBudget: 100 },
  { id: "subscriptions", label: "Subscriptions", emoji: "🔁", defaultBudget: 80 },
  { id: "income", label: "Income", emoji: "💵", defaultBudget: 0 },
  { id: "other", label: "Other", emoji: "📦", defaultBudget: 100 },
];

export const CATEGORY_MAP: Record<ExpenseCategory, CategoryMeta> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
    ExpenseCategory,
    CategoryMeta
  >;

/** Default monthly budget per category, for quick coach insights. */
export const DEFAULT_BUDGETS: Record<ExpenseCategory, number> =
  Object.fromEntries(
    CATEGORIES.map((c) => [c.id, c.defaultBudget]),
  ) as Record<ExpenseCategory, number>;
