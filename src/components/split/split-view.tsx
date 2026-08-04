"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle2, Handshake, Users } from "lucide-react";
import { CATEGORY_MAP } from "@/lib/constants";
import { formatMoney } from "@/lib/currency";
import { useExpenseStore } from "@/store/expense-store";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";

/**
 * Split expenses + settlement tracking.
 *
 * Each split expense lists its participants and their shares. A participant
 * can be marked settled, which persists through the normal expense update
 * pipeline (and therefore syncs too).
 */
export function SplitView() {
  const expenses = useExpenseStore((s) => s.expenses);
  const updateExpense = useExpenseStore((s) => s.updateExpense);
  const haptic = useHaptic();

  const splitExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.split && e.split.participants.length > 0)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses],
  );

  const totalOutstanding = useMemo(
    () =>
      splitExpenses.reduce((sum, e) => {
        const split = e.split!;
        const settledSum = Object.values(split.settledBy).reduce(
          (s, date) => (date ? s + 1 : s),
          0,
        );
        const remaining = split.participants.length - settledSum;
        return sum + remaining * (e.amount / (split.participants.length + 1));
      }, 0),
    [splitExpenses],
  );

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 p-5 text-white shadow-lg shadow-emerald-500/20">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <Handshake className="size-4" /> Outstanding balance
        </div>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatMoney(totalOutstanding)}
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          To be collected from friends & roommates
        </p>
      </div>

      {splitExpenses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Users className="size-6" />
          <p>No split expenses yet.</p>
          <p className="text-xs">
            Add an expense and enable <span className="font-medium">Split with friends</span>.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {splitExpenses.map((e) => {
            const split = e.split!;
            const count = split.participants.length + 1;
            const share = e.amount / count;
            return (
              <li key={e.id} className="overflow-hidden rounded-2xl border bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
                    {CATEGORY_MAP[e.category]?.emoji ?? "📦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.merchant}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(`${e.date}T00:00:00`), "MMM d")} · {count} ways
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(e.amount, e.currency)}
                  </span>
                </div>
                <ul className="border-t border-border/60 px-4 py-2">
                  <ParticipantRow name="You" share={share} settled />
                  {split.participants.map((p) => {
                    const settled = Boolean(split.settledBy[p.id]);
                    return (
                      <ParticipantRow
                        key={p.id}
                        name={p.name}
                        share={p.share}
                        settled={settled}
                        onToggle={() => {
                          haptic(settled ? "tap" : "success");
                          const settledBy = { ...split.settledBy };
                          if (settled) delete settledBy[p.id];
                          else settledBy[p.id] = new Date().toISOString();
                          void updateExpense(e.id, {
                            split: { ...split, settledBy },
                          });
                        }}
                      />
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ParticipantRow({
  name,
  share,
  settled,
  onToggle,
}: {
  name: string;
  share: number;
  settled: boolean;
  onToggle?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          settled ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground",
        )}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className={cn("flex-1 truncate text-sm", settled && "text-muted-foreground")}>
        {name}
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {formatMoney(share)}
      </span>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={settled}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            settled
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          <CheckCircle2 className="size-3.5" />
          {settled ? "Settled" : "Settle"}
        </button>
      ) : (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          You
        </span>
      )}
    </li>
  );
}
