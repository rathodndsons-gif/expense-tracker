"use client";

import { useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { CalendarClock, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BASE_CURRENCY,
  CATEGORIES,
  CURRENCIES,
  CURRENCY_SYMBOLS,
} from "@/lib/constants";
import { formatMoney } from "@/lib/currency";
import { useExpenseStore } from "@/store/expense-store";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";
import type { CurrencyCode, ExpenseCategory, SubscriptionCadence } from "@/lib/types";

const CADENCE_EMOJI: Record<SubscriptionCadence, string> = {
  daily: "📅",
  weekly: "🗓️",
  monthly: "📆",
  yearly: "🎉",
};

function toMonthly(amount: number, cadence: SubscriptionCadence): number {
  switch (cadence) {
    case "daily":
      return amount * 30.4;
    case "weekly":
      return amount * 4.345;
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
  }
}

export function SubscriptionsView() {
  const subscriptions = useExpenseStore((s) => s.subscriptions);
  const add = useExpenseStore((s) => s.addSubscription);
  const toggle = useExpenseStore((s) => s.toggleSubscription);
  const haptic = useHaptic();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(BASE_CURRENCY);
  const [cadence, setCadence] = useState<SubscriptionCadence>("monthly");
  const [category, setCategory] = useState<ExpenseCategory>("subscriptions");
  const [nextBilling, setNextBilling] = useState(() =>
    format(new Date(Date.now() + 30 * 86_400_000), "yyyy-MM-dd"),
  );

  const active = subscriptions.filter((s) => s.active);
  const monthlyTotal = active.reduce(
    (sum, s) => sum + toMonthly(s.amountBase, s.cadence),
    0,
  );

  const handleAdd = async () => {
    const amt = Number(amount);
    if (!name.trim() || !amt || amt <= 0) return;
    haptic("success");
    await add({
      name: name.trim(),
      amount: amt,
      currency,
      cadence,
      category,
      nextBilling,
      active: true,
    });
    setName("");
    setAmount("");
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 p-5 text-white shadow-lg shadow-purple-500/20">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <Repeat className="size-4" /> Monthly subscriptions
        </div>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(monthlyTotal)}</p>
        <p className="mt-0.5 text-xs text-white/70">
          {active.length} active {active.length === 1 ? "renewal" : "renewals"}
        </p>
      </div>

      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add subscription
      </Button>

      {subscriptions.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          No subscriptions tracked. Add Netflix, iCloud, gym — we’ll warn you before renewal.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border bg-card">
          {subscriptions.map((s) => {
            const days = differenceInCalendarDays(
              new Date(`${s.nextBilling}T00:00:00`),
              new Date(),
            );
            const dueSoon = days >= 0 && days <= 3;
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
                  {CATEGORIES.find((c) => c.id === s.category)?.emoji ?? CADENCE_EMOJI[s.cadence]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", !s.active && "text-muted-foreground line-through")}>
                    {s.name}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3" />
                    {s.active ? `Renews ${format(new Date(`${s.nextBilling}T00:00:00`), "MMM d")}` : "Paused"}
                    {dueSoon && s.active && (
                      <Badge variant="destructive" className="ml-1 text-[10px]">
                        in {days}d
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(s.amountBase)}/mo
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      void toggle(s.id);
                    }}
                    className="text-xs text-primary"
                  >
                    {s.active ? "Pause" : "Resume"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle>New subscription</DrawerTitle>
            <DrawerDescription>
              We&apos;ll alert you a few days before the next renewal.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Netflix"
                className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="9.99"
                  className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Currency</span>
                <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                  <SelectTrigger className="rounded-xl bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CURRENCY_SYMBOLS[c]} {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Cadence</span>
                <Select value={cadence} onValueChange={(v) => setCadence(v as SubscriptionCadence)}>
                  <SelectTrigger className="rounded-xl bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["daily", "weekly", "monthly", "yearly"] as SubscriptionCadence[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CADENCE_EMOJI[c]} {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Next billing</span>
                <input
                  type="date"
                  value={nextBilling}
                  onChange={(e) => setNextBilling(e.target.value)}
                  className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Category</span>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger className="rounded-xl bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button onClick={handleAdd} disabled={!name.trim() || Number(amount) <= 0}>
              Save subscription
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
