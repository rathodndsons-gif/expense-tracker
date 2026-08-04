"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useExpenseStore } from "@/store/expense-store";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import {
  cashFlowForecast,
  categoryBreakdown,
  monthlyTotals,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";
import { CATEGORY_MAP } from "@/lib/constants";

const COLORS = [
  "#5E5CE6",
  "#0A84FF",
  "#FF9F0A",
  "#FF375F",
  "#30D158",
  "#64D2FF",
  "#FFD60A",
  "#BF5AF2",
  "#FF6482",
  "#AC8E68",
  "#32ADE6",
  "#FF453A",
  "#666666",
];

/** Analytics tab: multi-month trend, category breakdown, cash-flow forecast. */
export function StatsView() {
  const expenses = useExpenseStore((s) => s.expenses);
  const subscriptions = useExpenseStore((s) => s.subscriptions);
  const { online } = useOfflineSync();

  const months = useMemo(() => monthlyTotals(expenses, 6), [expenses]);
  const categories = useMemo(() => categoryBreakdown(expenses), [expenses]);
  const forecast = useMemo(
    () => cashFlowForecast(expenses, subscriptions),
    [expenses, subscriptions],
  );

  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <section>
        <h2 className="mb-3 text-base font-semibold">Monthly overview</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  formatMoney(Number(value)),
                  name === "expense" ? "Spent" : "Income",
                ]}
              />
              <Bar dataKey="expense" fill="#FF375F" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="income" fill="#30D158" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Where it went</h2>
        {categories.length === 0 ? (
          <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            No spending this month yet.
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="total"
                    nameKey="label"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {categories.map((c, i) => (
                      <Cell
                        key={c.category}
                        fill={COLORS[i % COLORS.length]}
                        onClick={undefined}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [formatMoney(Number(value)), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              {categories.map((c, i) => (
                <li key={c.category} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {c.emoji} {c.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(c.total)}
                  </span>
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {c.pct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Cash-flow forecast</h2>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-emerald-500">
            <TrendingUp className="size-4" />
            <span className="text-sm font-medium">Next 30 days</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {formatMoney(forecast.next30Days)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ~{formatMoney(forecast.dailyAvg)}/day at your current pace.
            {!online && " Syncing will refine this with remote data."}
          </p>
          {forecast.byCategoryNext30Days.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {forecast.byCategoryNext30Days.map((c) => (
                <span
                  key={c.category}
                  className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {CATEGORY_MAP[c.category]?.emoji} {formatMoney(c.total)} renewing
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
