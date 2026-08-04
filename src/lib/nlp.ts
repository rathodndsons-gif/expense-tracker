import {
  format,
  parseISO,
  startOfDay,
  subDays,
  subWeeks,
} from "date-fns";
import { BASE_CURRENCY } from "./constants";
import { convertCurrency } from "./currency";
import { classifyType } from "./db/repository";
import type {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseType,
} from "./types";

/**
 * Natural Language expense parser.
 *
 * Turns free-form phrases like
 *   "Uber to airport for 25 dollars yesterday"
 * into a structured Expense draft. It is rule-based (deterministic, works
 * offline, no API key) and covers: amounts with currency symbols/words, dates
 * (today/yesterday/weekdays/ago/ISO), income vs expense, merchant extraction
 * and category inference.
 */

export interface ParsedExpense {
  amount: number;
  currency: CurrencyCode;
  merchant: string;
  note: string;
  category: ExpenseCategory;
  type: ExpenseType;
  date: Date;
  confidence: number;
}

export interface ParseResult {
  parsed: ParsedExpense | null;
  /** Human explanation of what was extracted, for the preview card. */
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Amount helpers                                                      */
/* ------------------------------------------------------------------ */

const CURRENCY_TOKENS: Record<string, CurrencyCode> = {
  $: "USD", usd: "USD", dollar: "USD", dollars: "USD", bucks: "USD", buck: "USD",
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP", quid: "GBP",
  "¥": "JPY", jpy: "JPY", yen: "JPY",
  "₹": "INR", inr: "INR", rupee: "INR", rupees: "INR",
  "c$": "CAD", "cad": "CAD",
  "a$": "AUD", aud: "AUD",
  chf: "CHF", "fr": "CHF", franc: "CHF", francs: "CHF",
  "r$": "BRL", brl: "BRL", real: "BRL",
  "mx$": "MXN", mxn: "MXN", peso: "MXN", pesos: "MXN",
};

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

const MAGNITUDE: Record<string, number> = {
  hundred: 100, thousand: 1000, million: 1_000_000,
};

function wordToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t === "a" || t === "an") {
      current += 1;
    } else if (ONES[t] !== undefined) {
      current += ONES[t];
    } else if (TENS[t] !== undefined) {
      current += TENS[t];
    } else if (MAGNITUDE[t] !== undefined) {
      current = current === 0 ? MAGNITUDE[t] : current * MAGNITUDE[t];
      total += current;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}

function isNumberToken(token: string): boolean {
  return /^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?$/.test(token) ||
    /^\d+$/.test(token);
}

function parseNumberToken(token: string): number | null {
  if (!isNumberToken(token)) return null;
  const cleaned = token.replace(/[.,](?=\d{3}$)/g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3,
  april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

function mostRecentWeekday(weekdayIndex: number, from: Date): Date {
  const day = (from.getDay() + 7) % 7;
  const diff = (day - weekdayIndex + 7) % 7;
  const d = startOfDay(new Date(from));
  d.setDate(d.getDate() - diff);
  return d;
}

/** Try to extract a date; returns `null` when nothing matched. */
function extractDate(tokens: string[]): { date: Date; consumed: string[] } | null {
  const lower = tokens.map((t) => t.toLowerCase());
  const consumed = new Set<number>();
  const today = new Date();

  // ISO / slashed / dotted dates, e.g. 2024-01-15, 15/01/2024, 01.15.24
  for (let i = 0; i < tokens.length; i++) {
    const iso = tokens[i].match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const d = parseISO(tokens[i]);
      if (!Number.isNaN(d.getTime())) {
        consumed.add(i);
        return { date: startOfDay(d), consumed: [...consumed].map((n) => tokens[n]) };
      }
    }
    const slash = tokens[i].match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
    if (slash) {
      const [, a, b, y] = slash;
      const year = y ? Number(y) : today.getFullYear();
      const d = new Date(year, Number(b) - 1, Number(a));
      if (d.getMonth() === Number(b) - 1) {
        consumed.add(i);
        return { date: startOfDay(d), consumed: [...consumed].map((n) => tokens[n]) };
      }
    }
  }

  // Relative: today / tonight / now
  for (let i = 0; i < lower.length; i++) {
    if (lower[i] === "today" || lower[i] === "tonight" || lower[i] === "now") {
      consumed.add(i);
      return { date: startOfDay(today), consumed: [tokens[i]] };
    }
    if (lower[i] === "yesterday") {
      consumed.add(i);
      return { date: startOfDay(subDays(today, 1)), consumed: [tokens[i]] };
    }
    // "X days ago", "a week ago", "two weeks ago", "a month ago"
    if (lower[i] === "ago") {
      let unit: "day" | "week" | "month" | null = null;
      let count = 1;
      const prev = lower[i - 1];
      if (prev === "day" || prev === "days") unit = "day";
      else if (prev === "week" || prev === "weeks") unit = "week";
      else if (prev === "month" || prev === "months") unit = "month";
      if (unit) {
        const numWord = lower[i - 2];
        const num = isNumberToken(numWord)
          ? parseNumberToken(numWord)
          : wordToNumber([numWord]);
        if (num && num > 0) count = num;
        const d = new Date(today);
        if (unit === "day") d.setDate(d.getDate() - count);
        else if (unit === "week") d.setDate(d.getDate() - count * 7);
        else d.setMonth(d.getMonth() - count);
        // Consume exactly "N <unit> ago" (plus an optional leading a/an).
        for (let k = i - 2; k <= i; k++) {
          if (k >= 0 && k < tokens.length && !consumed.has(k)) consumed.add(k);
        }
        if (
          i - 3 >= 0 &&
          (lower[i - 3] === "a" || lower[i - 3] === "an")
        ) {
          consumed.add(i - 3);
        }
        return { date: startOfDay(d), consumed: [...consumed].map((n) => tokens[n]) };
      }
    }
    // "last week"
    if (lower[i] === "week" && lower[i - 1] === "last") {
      consumed.add(i - 1);
      consumed.add(i);
      return {
        date: startOfDay(subWeeks(today, 1)),
        consumed: [tokens[i - 1], tokens[i]],
      };
    }
  }

  // Weekday names: "monday", "on friday", "last saturday"
  for (let i = 0; i < lower.length; i++) {
    const wd = WEEKDAYS.indexOf(lower[i]);
    if (wd === -1) continue;
    const hasLast = lower[i - 1] === "last";
    let base = mostRecentWeekday(wd, today);
    if (hasLast) base = subDays(base, 7);
    if (hasLast && !consumed.has(i - 1)) consumed.add(i - 1);
    consumed.add(i);
    return {
      date: startOfDay(base),
      consumed: [...consumed].map((n) => tokens[n]),
    };
  }

  // Month + day: "jan 5", "5th of january", "the 3rd"
  for (let i = 0; i < lower.length; i++) {
    const monthIdx = MONTHS[lower[i]];
    if (monthIdx === undefined) continue;
    let day: number | null = null;
    let dayIdx = -1;
    const next = lower[i + 1]?.replace(/(st|nd|rd|th)$/i, "");
    if (next && /^\d{1,2}$/.test(next)) {
      day = Number(next);
      dayIdx = i + 1;
    } else {
      const prev = lower[i - 1]?.replace(/(st|nd|rd|th)$/i, "");
      if (prev && /^\d{1,2}$/.test(prev)) {
        day = Number(prev);
        dayIdx = i - 1;
      }
    }
    if (day === null) continue;
    const year = today.getFullYear();
    let d = new Date(year, monthIdx, day);
    if (d.getTime() > today.getTime()) {
      // Month/day has passed this year → assume last year's occurrence.
      d = new Date(year - 1, monthIdx, day);
    }
    consumed.add(i);
    if (dayIdx >= 0) consumed.add(dayIdx);
    return {
      date: startOfDay(d),
      consumed: [...consumed].map((n) => tokens[n]),
    };
  }

  // Bare day-of-month: "the 3rd", "on the 5th"
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^(\d{1,2})(st|nd|rd|th)$/i);
    if (!m) continue;
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d.getTime() > today.getTime()) d = new Date(today.getFullYear(), today.getMonth() - 1, day);
    consumed.add(i);
    return { date: startOfDay(d), consumed: [tokens[i]] };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Amount + currency extraction                                        */
/* ------------------------------------------------------------------ */

function isCurrencyToken(token: string): CurrencyCode | null {
  const t = token.toLowerCase();
  if (CURRENCY_TOKENS[t]) return CURRENCY_TOKENS[t];
  // $25 / 25$ / €30 / 30€ / 25usd
  const m = token.match(/^([^\d]*)(\d[\d.,]*)([^\d]*)$/);
  if (m) {
    const [, pre, , post] = m;
    if (pre && CURRENCY_TOKENS[pre.toLowerCase()]) {
      return CURRENCY_TOKENS[pre.toLowerCase()];
    }
    if (post && CURRENCY_TOKENS[post.toLowerCase()]) {
      return CURRENCY_TOKENS[post.toLowerCase()];
    }
  }
  return null;
}

function extractAmount(
  tokens: string[],
  original: string[],
): {
  amount: number;
  currency: CurrencyCode;
  consumed: string[];
} | null {
  for (let i = 0; i < tokens.length; i++) {
    // Word numbers like "twenty five dollars"
    const num = parseNumberToken(tokens[i]);
    if (num !== null) {
      // Look ahead for currency word, look behind for currency symbol.
      const nextCur = i + 1 < tokens.length ? isCurrencyToken(tokens[i + 1]) : null;
      const prevCur = i > 0 ? isCurrencyToken(tokens[i - 1]) : null;
      if (nextCur || prevCur) {
        const consumed = [original[i]];
        if (nextCur) consumed.push(original[i + 1]);
        else consumed.unshift(original[i - 1]);
        return {
          amount: num,
          currency: nextCur ?? prevCur ?? BASE_CURRENCY,
          consumed,
        };
      }
      // Plain number alone → default currency.
      return {
        amount: num,
        currency: BASE_CURRENCY,
        consumed: [original[i]],
      };
    }

    const cur = isCurrencyToken(tokens[i]);
    if (cur) {
      // Combined token such as "$25", "30€" or "25usd".
      const embedded = tokens[i].match(/^[^\d]*(\d[\d.,]*)[^\d]*$/);
      if (embedded) {
        const value = parseNumberToken(embedded[1]);
        if (value !== null) {
          return { amount: value, currency: cur, consumed: [original[i]] };
        }
      }
      // Split token pair such as "25 dollars" or "€ 30".
      const numNext = i + 1 < tokens.length ? parseNumberToken(tokens[i + 1]) : null;
      const numPrev = i > 0 ? parseNumberToken(tokens[i - 1]) : null;
      const hasNumber = numNext !== null || numPrev !== null;
      if (hasNumber) {
        const amount = numNext ?? numPrev;
        const consumed = numNext !== null
          ? [original[i], original[i + 1]]
          : [original[i - 1], original[i]];
        return { amount: amount ?? 0, currency: cur, consumed };
      }
    }
  }

  // Word numbers: "twenty five dollars" / "five euros"
  for (let i = 0; i < tokens.length; i++) {
    const seq: string[] = [];
    let j = i;
    let end = i;
    while (j < tokens.length && j < i + 5) {
      const w = tokens[j].toLowerCase();
      if (ONES[w] === undefined && TENS[w] === undefined && MAGNITUDE[w] === undefined && w !== "a" && w !== "an") break;
      seq.push(w);
      end = j;
      j++;
    }
    if (seq.length === 0) continue;
    const value = wordToNumber(seq);
    if (value === null || value <= 0) continue;
    let currency: CurrencyCode = BASE_CURRENCY;
    const after = i + seq.length < tokens.length ? tokens[i + seq.length] : null;
    if (after && isCurrencyToken(after)) currency = isCurrencyToken(after)!;
    return {
      amount: value,
      currency,
      consumed: original.slice(i, end + 1 + (after && isCurrencyToken(after) ? 1 : 0)),
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Merchant + note extraction                                          */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "for", "at", "in", "on", "from", "to", "with", "and", "the", "a", "an",
  "of", "spent", "paid", "buy", "bought", "got", "purchased", "spend",
  "around", "about", "roughly", "approx", "approximately", "total", "was",
  "is", "then", "some", "worth", "pay", "paid", "had", "have",
]);

function isDateLike(token: string): boolean {
  const t = token.toLowerCase();
  return (
    WEEKDAYS.includes(t) ||
    MONTHS[t] !== undefined ||
    ["today", "yesterday", "tonight", "now", "ago", "last", "days", "day", "weeks", "week"].includes(t)
  );
}

function extractMerchantAndNote(
  tokens: string[],
  original: string[],
  consumed: Set<number>,
): { merchant: string; note: string } {
  const idx: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    idx.push(i);
  }

  // Take the first capitalized word (in the original casing) as the merchant,
  // then everything up to the next capitalized word becomes its note.
  const merchantParts: string[] = [];
  const noteParts: string[] = [];
  let seenMerchant = false;
  let firstCap = false;

  for (const i of idx) {
    const t = tokens[i];
    const orig = original[i];
    const isStop = STOPWORDS.has(t) || isDateLike(t);
    const startsCapital = /^[A-Z]/.test(orig);

    if (!seenMerchant && (startsCapital || !isStop)) {
      merchantParts.push(orig);
      firstCap = startsCapital;
      seenMerchant = true;
      continue;
    }
    // Extend a proper-name merchant ("Whole Foods", "Air France") — only when
    // the first word was already capitalized.
    if (seenMerchant && startsCapital && merchantParts.length < 2 && firstCap) {
      merchantParts.push(orig);
      continue;
    }
    if (!isStop) noteParts.push(orig);
  }

  // Fallback: no capitalized word → first meaningful token is the merchant.
  if (merchantParts.length === 0) {
    const firstMeaningful = idx.find((i) => !STOPWORDS.has(tokens[i]) && !isDateLike(tokens[i]));
    if (firstMeaningful !== undefined) {
      merchantParts.push(original[firstMeaningful]);
      noteParts.push(
        ...idx
          .filter((i) => i > firstMeaningful && !STOPWORDS.has(tokens[i]) && !isDateLike(tokens[i]))
          .map((i) => original[i]),
      );
    }
  }

  return {
    merchant: merchantParts.join(" "),
    note: noteParts.join(" "),
  };
}

/* ------------------------------------------------------------------ */
/* Category inference                                                  */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  transport: ["uber", "lyft", "taxi", "cab", "metro", "subway", "train", "bus", "parking", "gas", "fuel", "petrol", "toll", "transit", "scooter", "bike share"],
  food: ["restaurant", "cafe", "coffee", "starbucks", "lunch", "dinner", "breakfast", "brunch", "mcdonald", "kfc", "pizza", "sushi", "burger", "bar", "drinks", "doordash", "ubereats", "grubhub", "takeout", "food"],
  groceries: ["walmart", "whole foods", "kroger", "trader joe", "aldi", "costco", "safeway", "supermarket", "grocery", "groceries", "farmers market"],
  housing: ["rent", "mortgage", "landlord", "apartment", "lease", "deposit"],
  utilities: ["electric", "electricity", "water", "internet", "wifi", "phone bill", "verizon", "at&t", "t-mobile", "utility", "gas bill", "heating"],
  entertainment: ["netflix", "movie", "cinema", "concert", "gaming", "game", "amusement", "youtube", "disney", "hulu", "hbo", "tickets", "bowling"],
  shopping: ["amazon", "target", "mall", "clothes", "clothing", "shoes", "electronics", "best buy", "apple store", "ikea", "home depot", "shop", "purchase", "thrift"],
  health: ["pharmacy", "doctor", "dentist", "hospital", "medicine", "prescription", "gym", "fitness", "therapy", "lab", "insurance", "cvs", "walgreens"],
  travel: ["flight", "airline", "delta", "united", "american airlines", "hotel", "airbnb", "airport", "trip", "vacation", "hostel", "booking"],
  education: ["tuition", "school", "college", "course", "udemy", "coursera", "book", "library", "class", "textbook"],
  subscriptions: ["netflix", "spotify", "youtube", "hulu", "disney", "hbo", "icloud", "adobe", "google one", "dropbox", "notion", "chatgpt", "subscription", "membership", "apple music", "amazon prime"],
  income: ["salary", "paycheck", "payroll", "refund", "dividend", "interest", "freelance", "bonus", "deposit", "gift"],
  other: [],
};

/** Tie-break priority when two categories match equally well. */
const CATEGORY_PRIORITY: Record<ExpenseCategory, number> = {
  health: 1,
  subscriptions: 2,
  groceries: 3,
  utilities: 4,
  housing: 5,
  transport: 6,
  travel: 7,
  food: 8,
  shopping: 9,
  entertainment: 10,
  education: 11,
  income: 12,
  other: 13,
};

export function inferCategory(merchant: string, note: string): ExpenseCategory {
  const text = `${merchant} ${note}`.toLowerCase();
  let best: ExpenseCategory = "other";
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += text === kw ? 3 : 1;
      }
    }
    const category = cat as ExpenseCategory;
    const isTie =
      score === bestScore &&
      score > 0 &&
      CATEGORY_PRIORITY[category] < CATEGORY_PRIORITY[best];
    if (score > bestScore || isTie) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function parseExpense(input: string, now = new Date()): ParseResult {
  const original = input.trim().split(/\s+/);
  if (original.length === 0) return { parsed: null, summary: "Type a phrase like “coffee for 5 dollars”." };

  const lower = original.map((t) => t.toLowerCase());

  const dateResult = extractDate(lower);
  const dateConsumed = new Set<number>();
  let date = startOfDay(now);
  if (dateResult) {
    date = dateResult.date;
    for (const t of dateResult.consumed) {
      const i = original.indexOf(t);
      if (i >= 0) dateConsumed.add(i);
    }
  }

  const consumed = new Set(dateConsumed);
  const amountResult = extractAmount(lower, original);
  let amount = 0;
  let currency: CurrencyCode = BASE_CURRENCY;
  if (amountResult) {
    amount = amountResult.amount;
    currency = amountResult.currency;
    for (const t of amountResult.consumed) {
      const i = original.indexOf(t);
      if (i >= 0) consumed.add(i);
    }
  }

  const { merchant, note } = extractMerchantAndNote(lower, original, consumed);
  const category = merchant || note ? inferCategory(merchant, note) : "other";
  const type: ExpenseType = classifyType(merchant, note);

  const fields: string[] = [];
  if (amount > 0) fields.push(formatAmount(amount, currency));
  fields.push(type === "income" ? "income" : "expense");
  if (merchant) fields.push(merchant);
  if (note) fields.push(`(${note})`);
  fields.push(format(date, "MMM d"));

  const parsed: ParsedExpense = {
    amount,
    currency,
    merchant,
    note,
    category,
    type,
    date,
    confidence: [
      amount > 0,
      dateResult !== null,
      merchant.length > 0,
      category !== "other",
    ].filter(Boolean).length / 4,
  };

  return {
    parsed,
    summary: fields.join(" · "),
  };
}

function formatAmount(amount: number, currency: CurrencyCode): string {
  const symbols: Partial<Record<CurrencyCode, string>> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹", CAD: "C$", AUD: "A$", CHF: "Fr", BRL: "R$", MXN: "MX$",
  };
  const decimals = currency === "JPY" ? 0 : 2;
  return `${symbols[currency] ?? ""}${amount.toFixed(decimals)}`;
}

/** Turn a parsed result into a full Expense draft (ready to persist). */
export function parsedToExpense(
  parsed: ParsedExpense,
  amountBase?: number,
): Omit<Expense, "id" | "createdAt" | "updatedAt" | "deleted" | "dirty" | "amountBase"> & { amountBase?: number } {
  return {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    amountBase,
    category: parsed.category,
    merchant: parsed.merchant,
    note: parsed.note,
    date: format(parsed.date, "yyyy-MM-dd"),
  };
}

/** Base-currency conversion helper for drafts, mirrored from currency.ts. */
export function draftAmountBase(amount: number, currency: CurrencyCode): number {
  return convertCurrency(amount, currency, BASE_CURRENCY);
}
