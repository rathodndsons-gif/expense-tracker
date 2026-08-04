"use client";

import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { CATEGORY_MAP } from "@/lib/constants";
import { formatMoney } from "@/lib/currency";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";
import type { Expense } from "@/lib/types";

const DELETE_WIDTH = 84;

/**
 * Swipe-to-delete row (iOS Mail style).
 *
 * Drag left to reveal a destructive action. Soft-deletes the record and offers
 * an Undo action via toast — the sync engine later propagates the tombstone.
 */
export function ExpenseList({
  expenses,
  onDelete,
  onRestore,
}: {
  expenses: Expense[];
  onDelete: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {expenses.map((e) => (
        <SwipeableRow
          key={e.id}
          onDelete={() =>
            void onDelete(e.id).then(() => {
              toast("Expense deleted", {
                description: `${e.merchant || "Entry"} · ${formatMoney(
                  e.amount,
                  e.currency,
                )}`,
                action: {
                  label: "Undo",
                  onClick: () => void onRestore(e.id),
                },
                duration: 5000,
              });
            })
          }
        >
          <div className="flex w-full items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
              {CATEGORY_MAP[e.category]?.emoji ?? "📦"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.merchant || "Unnamed"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {CATEGORY_MAP[e.category]?.label} · {format(new Date(`${e.date}T00:00:00`), "MMM d")}
                {e.note ? ` · ${e.note}` : ""}
                {e.split?.participants.length ? ` · split ${e.split.participants.length + 1} ways` : ""}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                e.type === "income" ? "text-emerald-500" : "text-foreground",
              )}
            >
              {e.type === "income" ? "+" : "−"}
              {formatMoney(e.amount, e.currency)}
            </span>
          </div>
        </SwipeableRow>
      ))}
    </ul>
  );
}

function SwipeableRow({
  children,
  onDelete,
}: {
  children: ReactNode;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);
  const haptic = useHaptic();

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const next = Math.min(0, Math.max(-DELETE_WIDTH, startOffset.current + dx));
    setOffset(next);
    if (next < -20) haptic("tap");
  };

  const onTouchEnd = () => {
    if (startX.current === null) return;
    startX.current = null;
    setOffset(offset < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0);
  };

  return (
    <li
      className="relative overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <button
        type="button"
        aria-label="Delete"
        onClick={() => {
          haptic("delete");
          onDelete();
        }}
        className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center bg-red-500 text-white"
        style={{ width: DELETE_WIDTH }}
      >
        <Trash2 className="size-5" />
      </button>
      <div
        className="relative bg-background transition-transform"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current !== null ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </li>
  );
}
