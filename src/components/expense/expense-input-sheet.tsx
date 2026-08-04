"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Mic,
  Plus,
  Split,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { parseExpense } from "@/lib/nlp";
import { draftAmountBase } from "@/lib/nlp";
import { downscaleImage, extractReceiptText } from "@/lib/ocr";
import { useExpenseStore } from "@/store/expense-store";
import { useHaptic } from "@/hooks/use-haptic";
import { cn } from "@/lib/utils";
import type { CurrencyCode, ExpenseCategory, ExpenseType, Split as SplitModel } from "@/lib/types";

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: (event: { results: Array<Array<{ transcript: string }>> }) => void;
  start: () => void;
}

/**
 * Lightning-fast expense entry sheet.
 *
 *  - Natural language input with live parsing preview
 *  - Speech-to-text (Web Speech API where available)
 *  - Receipt OCR via camera capture
 *  - Quick-tap category chips
 *  - Optional split-expense editor
 */

interface Draft {
  amount: number;
  merchant: string;
  note: string;
  currency: CurrencyCode;
  category: ExpenseCategory;
  type: ExpenseType;
  date: string;
  split: SplitModel | undefined;
}

function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function emptyDraft(): Draft {
  return {
    amount: 0,
    merchant: "",
    note: "",
    currency: BASE_CURRENCY,
    category: "other",
    type: "expense",
    date: todayISO(),
    split: undefined,
  };
}

export function ExpenseInputSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addExpense = useExpenseStore((s) => s.addExpense);
  const haptic = useHaptic();
  const [nlpText, setNlpText] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when the sheet opens.
  useEffect(() => {
    if (open) {
      setNlpText("");
      setDraft(emptyDraft());
      setPreviewUrl(null);
    }
  }, [open]);

  const parseResult = useMemo(() => parseExpense(nlpText), [nlpText]);

  // Live-apply the NLP parse to the draft.
  useEffect(() => {
    if (!nlpText.trim()) return;
    const p = parseResult.parsed;
    if (p && p.amount > 0) {
      setDraft((d) => ({
        ...d,
        amount: p.amount,
        currency: p.currency,
        merchant: p.merchant || d.merchant,
        note: p.note || d.note,
        category: p.category,
        type: p.type,
        date: format(p.date, "yyyy-MM-dd"),
      }));
    }
  }, [nlpText, parseResult.parsed]);

  const applyParsed = () => {
    const p = parseResult.parsed;
    if (!p) return;
    setDraft((d) => ({
      ...d,
      amount: p.amount,
      currency: p.currency,
      merchant: p.merchant,
      note: p.note,
      category: p.category,
      type: p.type,
      date: format(p.date, "yyyy-MM-dd"),
    }));
    haptic("tap");
  };

  const handleSave = async () => {
    if (draft.amount <= 0) return;
    haptic("success");
    await addExpense({
      type: draft.type,
      amount: draft.amount,
      currency: draft.currency,
      amountBase: draftAmountBase(draft.amount, draft.currency),
      category: draft.category,
      merchant: draft.merchant || draft.category,
      note: draft.note,
      date: draft.date,
      split: draft.split,
    });
    onOpenChange(false);
  };

  const handleMic = () => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      haptic("warning");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => setNlpText(e.results[0][0].transcript);
    rec.start();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    haptic("tap");
    setScanning(true);
    try {
      const dataUrl = await downscaleImage(file);
      setPreviewUrl(dataUrl);
      const ocr = await extractReceiptText(dataUrl);
      const parsed = parseExpense(ocr.text);
      if (parsed.parsed && parsed.parsed.amount > 0) {
        const p = parsed.parsed;
        setDraft((d) => ({
          ...d,
          amount: p.amount,
          currency: p.currency,
          merchant: p.merchant || d.merchant,
          category: p.category,
          type: p.type,
          note: p.note || d.note,
        }));
        haptic("success");
      }
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh] pb-safe">
        <DrawerHeader>
          <DrawerTitle>Add expense</DrawerTitle>
          <DrawerDescription>
            Type naturally, pick a category, or scan a receipt.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-6">
          {/* NLP input */}
          <div className="flex items-end gap-2">
            <textarea
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              placeholder="e.g. “Uber to airport for 250 rupees yesterday”"
              rows={2}
              className="min-h-0 w-full flex-1 resize-none rounded-xl border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button type="button" size="icon" variant="outline" onClick={handleMic} aria-label="Dictate">
              <Mic className="size-4" />
            </Button>
          </div>

          {/* Parse preview + apply */}
          {nlpText.trim() && (
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {parseResult.summary}
              </p>
              {parseResult.parsed?.amount ? (
                <Button size="sm" variant="secondary" onClick={applyParsed}>
                  <Check className="size-3.5" /> Use
                </Button>
              ) : null}
            </div>
          )}

          {/* Camera scan */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
          >
            <Camera className="size-4" />
            {scanning ? "Reading receipt…" : "Scan receipt"}
          </Button>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="h-24 w-full rounded-xl object-cover opacity-80"
            />
          )}

          {/* Quick category chips */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => c.id !== "income").map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, category: c.id }));
                  haptic("tap");
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  draft.category === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground",
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Amount</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={draft.amount || ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amount: Number(e.target.value) }))
                }
                placeholder="0.00"
                className="rounded-xl border bg-card px-3 py-2.5 text-lg font-semibold outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Currency</span>
              <Select
                value={draft.currency}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, currency: v as CurrencyCode }))
                }
              >
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

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Date</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, date: e.target.value }))
                }
                className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Merchant</span>
              <input
                value={draft.merchant}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, merchant: e.target.value }))
                }
                placeholder="Who?"
                className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Note</span>
              <input
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="Optional"
                className="rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          {/* Type segmented control */}
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border">
            {(["expense", "income"] as ExpenseType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, type: t }))}
                className={cn(
                  "py-2.5 text-sm font-medium capitalize transition-colors",
                  draft.type === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <SplitEditor
            amount={draft.amount}
            split={draft.split}
            onToggle={(split) => setDraft((d) => ({ ...d, split }))}
          />

          <Button size="lg" onClick={handleSave} disabled={draft.amount <= 0}>
            Save {draft.amount > 0 ? `· ${CURRENCY_SYMBOLS[draft.currency]}${draft.amount.toFixed(2)}` : ""}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SplitEditor({
  amount,
  split,
  onToggle,
}: {
  amount: number;
  split: SplitModel | undefined;
  onToggle: (split: SplitModel | undefined) => void;
}) {
  const [name, setName] = useState("");
  const haptic = useHaptic();

  const addParticipant = () => {
    if (!name.trim()) return;
    haptic("tap");
    const next: SplitModel = {
      participants: [
        ...(split?.participants ?? []),
        { id: crypto.randomUUID(), name: name.trim(), share: 0 },
      ],
      settledBy: split?.settledBy ?? {},
    };
    distribute(next, amount);
    onToggle(next);
    setName("");
  };

  const removeParticipant = (id: string) => {
    const next: SplitModel = {
      participants: (split?.participants ?? []).filter((p) => p.id !== id),
      settledBy: split?.settledBy ?? {},
    };
    distribute(next, amount);
    onToggle(next);
  };

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          onToggle(split ? undefined : { participants: [], settledBy: {} });
        }}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Split className="size-4" /> Split with friends
        </span>
        <Badge variant={split ? "default" : "secondary"}>
          {split ? "On" : "Off"}
        </Badge>
      </button>

      {split && (
        <div className="flex flex-col gap-2 border-t px-3 py-3">
          {split.participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                value={p.name}
                onChange={(e) => {
                  const next: SplitModel = {
                    ...split,
                    participants: split.participants.map((x) =>
                      x.id === p.id ? { ...x, name: e.target.value } : x,
                    ),
                  };
                  onToggle(next);
                }}
                className="flex-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm outline-none"
              />
              <span className="w-14 text-right text-sm text-muted-foreground">
                {CURRENCY_SYMBOLS[BASE_CURRENCY]}
                {p.share.toFixed(2)}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeParticipant(p.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addParticipant();
              }}
              placeholder="Friend's name"
              className="flex-1 rounded-lg border bg-card px-2.5 py-1.5 text-sm outline-none"
            />
            <Button type="button" size="icon-sm" variant="secondary" onClick={addParticipant}>
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shares split evenly for now. Settlement tracking appears in the Split tab.
          </p>
        </div>
      )}
    </div>
  );
}

function distribute(split: SplitModel, amount: number): void {
  const n = split.participants.length;
  if (n === 0) return;
  const share = Math.round((amount / n) * 100) / 100;
  split.participants = split.participants.map((p) => ({ ...p, share }));
}
