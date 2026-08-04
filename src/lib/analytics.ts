import { format, subDays } from "date-fns";
import { CATEGORY_MAP, DEFAULT_BUDGETS } from "./constants";
import type {
  CoachInsight,
  Expense,
  ExpenseCategory,
  Subscription,
} from "./types";

/**
 * Read-only analytics + AI coach engine.
 *
 * Everything here is derived from the local dataset, so charts, forecasts and
 * coaching insights work fully offline. A real LLM can later replace
 * `buildCoachReply` behind the same interface (see ARCHITECTURE.md).
 */

export interface DailyTotal {
  date: string;
  label: string;
  expense: number;
  income: number;
}

export interface CategorySlice {
  category: ExpenseCategory;
  label: string;
  emoji: string;
  total: number;
  pct: number;
}

export interface MonthTotal {
  month: string;
  label: string;
  expense: number;
  income: number;
}

export interface Forecast {
  dailyAvg: number;
  next30Days: number;
  projectedMonth: number;
  byCategoryNext30Days: CategorySlice[];
}

/** Daily totals for the last `days` days (zero-filled for gaps). */
export function spendingByDay(
  expenses: Expense[],
  days: number,
  now = new Date(),
): DailyTotal[] {
  const map = new Map<string, { expense: number; income: number }>();
  for (const e of expenses) {
    if (e.deleted || e.type === "income") continue;
    const entry = map.get(e.date) ?? { expense: 0, income: 0 };
    entry.expense += e.amountBase;
    map.set(e.date, entry);
  }
  const out: DailyTotal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    const key = format(d, "yyyy-MM-dd");
    const v = map.get(key) ?? { expense: 0, income: 0 };
    out.push({ date: key, label: format(d, "MMM d"), ...v });
  }
  return out;
}

/** Category breakdown for a month, sorted by total descending. */
export function categoryBreakdown(
  expenses: Expense[],
  now = new Date(),
): CategorySlice[] {
  const monthKey = format(now, "yyyy-MM");
  const totals = new Map<ExpenseCategory, number>();
  let grand = 0;
  for (const e of expenses) {
    if (e.deleted || e.type === "income" || e.amountBase <= 0) continue;
    if (!e.date.startsWith(monthKey)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountBase);
    grand += e.amountBase;
  }
  const slices: CategorySlice[] = [...totals.entries()]
    .map(([category, total]) => ({
      category,
      label: CATEGORY_MAP[category]?.label ?? category,
      emoji: CATEGORY_MAP[category]?.emoji ?? "📦",
      total,
      pct: grand > 0 ? (total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
  return slices;
}

/** Monthly expense/income totals for the last `months` months. */
export function monthlyTotals(
  expenses: Expense[],
  months = 6,
  now = new Date(),
): MonthTotal[] {
  const buckets = new Map<string, { expense: number; income: number }>();
  for (const e of expenses) {
    if (e.deleted) continue;
    const key = e.date.slice(0, 7);
    const b = buckets.get(key) ?? { expense: 0, income: 0 };
    if (e.type === "income") b.income += e.amountBase;
    else b.expense += e.amountBase;
    buckets.set(key, b);
  }
  const out: MonthTotal[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = format(d, "yyyy-MM");
    const v = buckets.get(key) ?? { expense: 0, income: 0 };
    out.push({ month: key, label: format(d, "MMM"), ...v });
  }
  return out;
}

/**
 * Cash-flow forecast: average daily spend over the last 30 days, the
 * projected next-30-day spend, the projected full month, and a per-category
 * breakdown driven by upcoming subscription renewals.
 */
export function cashFlowForecast(
  expenses: Expense[],
  subscriptions: Subscription[],
  now = new Date(),
): Forecast {
  const last30 = spendingByDay(expenses, 30, now);
  const total30 = last30.reduce((s, d) => s + d.expense, 0);
  const dailyAvg = total30 / 30;

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKey = format(now, "yyyy-MM");
  let monthSpend = 0;
  for (const e of expenses) {
    if (e.deleted || e.type === "income") continue;
    if (e.date.startsWith(monthKey)) monthSpend += e.amountBase;
  }

  const next30 = new Date(now.getTime() + 30 * 86_400_000);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const sub of subscriptions) {
    if (!sub.active || sub.deleted) continue;
    const due = new Date(`${sub.nextBilling}T00:00:00`);
    if (due >= start && due <= next30) {
      byCategory.set(
        sub.category,
        (byCategory.get(sub.category) ?? 0) + sub.amountBase,
      );
    }
  }
  const forecastCat: CategorySlice[] = [...byCategory.entries()].map(
    ([category, total]) => ({
      category,
      label: CATEGORY_MAP[category]?.label ?? category,
      emoji: CATEGORY_MAP[category]?.emoji ?? "📦",
      total,
      pct: 0,
    }),
  );

  return {
    dailyAvg,
    next30Days: dailyAvg * 30,
    projectedMonth: Math.max(monthSpend, dailyAvg * 30),
    byCategoryNext30Days: forecastCat,
  };
}

/* ------------------------------------------------------------------ */
/* AI Financial Coach                                                  */
/* ------------------------------------------------------------------ */

/** Category spending this month vs. the default budget. */
function categoryVsBudget(
  expenses: Expense[],
  now = new Date(),
): Array<{ category: ExpenseCategory; spent: number; budget: number; ratio: number }> {
  const monthKey = format(now, "yyyy-MM");
  const spent = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    if (e.deleted || e.type === "income" || !e.date.startsWith(monthKey)) continue;
    spent.set(e.category, (spent.get(e.category) ?? 0) + e.amountBase);
  }
  return [...spent.entries()].map(([category, total]) => ({
    category,
    spent: total,
    budget: DEFAULT_BUDGETS[category] ?? 100,
    ratio: total / (DEFAULT_BUDGETS[category] ?? 100),
  }));
}

/** Rule-based insights. Wired to the Coach tab and dashboard warnings. */
export function getCoachInsights(
  expenses: Expense[],
  subscriptions: Subscription[],
  now = new Date(),
): CoachInsight[] {
  const insights: CoachInsight[] = [];
  const vsBudget = categoryVsBudget(expenses, now);

  for (const row of vsBudget) {
    if (row.ratio >= 1.5) {
      insights.push({
        id: `over_${row.category}`,
        kind: "warning",
        title: `${CATEGORY_MAP[row.category]?.label} is ${Math.round(
          row.ratio * 100,
        )}% over budget`,
        body: `You've spent ${fmt(row.spent)} so far this month against a ${fmt(
          row.budget,
        )} target. Consider pausing ${CATEGORY_MAP[row.category]?.label.toLowerCase()} until the next cycle.`,
      });
    } else if (row.ratio >= 1) {
      insights.push({
        id: `near_${row.category}`,
        kind: "tip",
        title: `${CATEGORY_MAP[row.category]?.label} budget nearly used`,
        body: `${fmt(row.spent)} of ${fmt(row.budget)} spent. A little restraint for the rest of the month keeps you on track.`,
      });
    }
  }

  // Duplicate/redundant subscriptions.
  const activeSubs = subscriptions.filter((s) => s.active && !s.deleted);
  const names = activeSubs.map((s) => s.name.toLowerCase());
  for (const sub of activeSubs) {
    const dupes = names.filter((n) => n.includes(sub.name.toLowerCase())).length;
    if (dupes > 1) {
      insights.push({
        id: `dup_${sub.id}`,
        kind: "warning",
        title: `Possible duplicate: ${sub.name}`,
        body: "Multiple active subscriptions look similar. Cancel the one you use least.",
      });
    }
  }

  // Cash flow.
  const forecast = cashFlowForecast(expenses, subscriptions, now);
  if (forecast.next30Days > 0) {
    insights.push({
      id: "forecast",
      kind: "info",
      title: "30-day cash flow forecast",
      body: `Based on the last 30 days you're on track to spend about ${fmt(
        forecast.next30Days,
      )} in the next month (~${fmt(forecast.dailyAvg)}/day).`,
    });
  }

  const income = expenses.filter(
    (e) => e.type === "income" && e.date.startsWith(format(now, "yyyy-MM")),
  );
  const incomeTotal = income.reduce((s, e) => s + e.amountBase, 0);
  const expenseTotal = vsBudget.reduce((s, r) => s + r.spent, 0);
  const savings = incomeTotal - expenseTotal;
  if (incomeTotal > 0 && savings < 0) {
    insights.push({
      id: "negative_flow",
      kind: "warning",
      title: "You're spending more than you earn",
      body: `This month: ${fmt(expenseTotal)} out vs. ${fmt(
        incomeTotal,
      )} in. A negative balance of ${fmt(-savings)} — let's trim one budget.`,
    });
  } else if (savings > 0) {
    insights.push({
      id: "positive_flow",
      kind: "success",
      title: "Healthy savings margin",
      body: `You're saving ${fmt(savings)} this month (${Math.round(
        (savings / incomeTotal) * 100,
      )}% of income). Consider moving it to a savings goal.`,
    });
  }

  return insights.slice(0, 6);
}

/** Basic natural-language reply from the coach (offline, deterministic). */
export function buildCoachReply(
  question: string,
  expenses: Expense[],
  subscriptions: Subscription[],
  now = new Date(),
): string {
  const q = question.toLowerCase();
  const insights = getCoachInsights(expenses, subscriptions, now);

  if (/(budget|spend (too|a lot)|overspend|over\s*-?\s*spend)/.test(q)) {
    const worst = insights.find((i) => i.kind === "warning");
    if (worst) return `${worst.title}. ${worst.body}`;
    return "Good news — no category is over budget this month. Keep it up!";
  }

  if (/(subscription|recurring|renew)/.test(q)) {
    const active = subscriptions.filter((s) => s.active && !s.deleted);
    if (active.length === 0) return "You have no active subscriptions tracked yet.";
    const total = active.reduce((s, x) => s + x.amountBase, 0);
    const names = active.map((s) => s.name).join(", ");
    return `You have ${active.length} active subscriptions (${names}) totalling ${fmt(
      total,
    )}/mo. Check the Subscriptions tab for renewal dates.`;
  }

  if (/forecast|future|cash ?flow/.test(q)) {
    const f = cashFlowForecast(expenses, subscriptions, now);
    return `At your current pace you'll spend about ${fmt(
      f.next30Days,
    )} in the next 30 days (${fmt(f.dailyAvg)}/day).${f.byCategoryNext30Days.length
      ? ` Upcoming renewals account for ${fmt(
          f.byCategoryNext30Days.reduce((s, c) => s + c.total, 0),
        )} of that.`
      : ""}`;
  }

  if (/save|tip|improve|advice/.test(q)) {
    const top = categoryBreakdown(expenses, now)[0];
    if (top) {
      return `Your biggest category this month is ${top.label} (${fmt(
        top.total,
      )}). Cutting just 10% there saves ${fmt(top.total * 0.1)}. Also check duplicate subscriptions for quick wins.`;
    }
    return "Add a few expenses first, then I can give tailored advice.";
  }

  if (insights.length > 0) {
    return `${insights[0].title}. ${insights[0].body}`;
  }
  return "You're in good shape. Add more expenses (try natural language like “coffee 5 dollars yesterday”) and I'll analyze your habits.";
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
