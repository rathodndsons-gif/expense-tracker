"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Plus, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseList } from "@/components/expense/expense-list";
import { useExpenseStore } from "@/store/expense-store";
import { categoryBreakdown, spendingByDay } from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#5E5CE6",
  "#0A84FF",
  "#FF9F0A",
  "#FF375F",
  "#30D158",
  "#64D2FF",
  "#FFD60A",
  "#BF5AF2",
];

/**
 * Home tab: monthly summary, spending trend, category breakdown and recent
 * transactions with swipe-to-delete.
 */
export function DashboardView({
  onAdd,
}: {
  onAdd: () => void;
}) {
  const expenses = useExpenseStore((s) => s.expenses);
  const ready = useExpenseStore((s) => s.ready);
  const softDelete = useExpenseStore((s) => s.softDeleteExpense);
  const restore = useExpenseStore((s) => s.restoreExpense);
  const haptic = useHaptic();

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = format(now, "yyyy-MM");
    let income = 0;
    let expense = 0;
    for (const e of expenses) {
      if (!e.date.startsWith(monthKey)) continue;
      if (e.type === "income") income += e.amountBase;
      else expense += e.amountBase;
    }
    return { income, expense, net: income - expense };
  }, [expenses]);

  const trend = useMemo(
    () => spendingByDay(expenses, 14, new Date()),
    [expenses],
  );
  const categories = useMemo(
    () => categoryBreakdown(expenses, new Date()).slice(0, 5),
    [expenses],
  );
  const recent = useMemo(
    () => [...expenses].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 12),
    [expenses],
  );

  if (!ready) {
    return <Skeleton />;
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      {/* Balance card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-blue-500 p-5 text-white shadow-lg shadow-indigo-500/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-white/70">This month</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {formatMoney(stats.net)}
            </p>
            <p className="mt-0.5 text-xs text-white/70">
              {stats.net >= 0 ? "ahead" : "behind"} by {formatMoney(Math.abs(stats.net))}
            </p>
          </div>
          <Sparkles className="size-5 text-white/80" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <StatPill label="Spent" value={formatMoney(stats.expense)} negative />
          <StatPill label="Income" value={formatMoney(stats.income)} />
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="h-14 rounded-2xl text-base"
          onClick={() => {
            haptic("tap");
            onAdd();
          }}
        >
          <Plus className="size-5" /> Add expense
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-14 rounded-2xl text-base"
          onClick={() => {
            haptic("tap");
            onAdd();
          }}
        >
          <ScanLine className="size-5" /> Scan receipt
        </Button>
      </section>

      {/* Trend chart */}
      <section>
        <SectionTitle title="Spending trend" subtitle="Last 14 days" />
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value) => [formatMoney(Number(value)), "Spent"]}
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#0A84FF"
                strokeWidth={2}
                fill="url(#trend)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Category breakdown */}
      <section>
        <SectionTitle title="Categories" subtitle="This month" />
        {categories.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="total"
                    nameKey="label"
                    innerRadius={34}
                    outerRadius={56}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {categories.map((c, i) => (
                      <Cell key={c.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              {categories.map((c, i) => (
                <li key={c.category} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {c.emoji} {c.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(c.total)}
                  </span>
                  <span className="w-9 text-right tabular-nums text-xs text-muted-foreground">
                    {c.pct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Recent transactions */}
      <section>
        <SectionTitle title="Recent" subtitle="Swipe to delete" />
        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <ExpenseList expenses={recent} onDelete={softDelete} onRestore={restore} />
        )}
      </section>
    </div>
  );
}

function StatPill({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-[11px] text-white/70">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", negative && "text-red-100")}>
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 py-10 text-center text-sm text-muted-foreground">
      No entries yet. Tap <span className="font-medium">Add expense</span> and try
      “coffee for 5 dollars yesterday”.
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      <div className="h-40 animate-pulse rounded-3xl bg-muted" />
      <div className="h-32 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}
