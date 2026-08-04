import { BASE_CURRENCY, CURRENCY_SYMBOLS, STATIC_RATES } from "./constants";
import type { CurrencyCode, RatesMap } from "./types";

/**
 * Multi-currency support with auto-conversion.
 *
 * The app ships with a static fallback rate table so it works offline out of
 * the box. When online it attempts to refresh rates from the free
 * open.er-api.com endpoint; on failure it silently falls back to static.
 */

let liveRates: RatesMap | null = null;
let ratesFetchedAt: number | null = null;

const RATE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Fetch the latest USD-based exchange rates. Never throws.
 * `force` bypasses the TTL cache.
 */
export async function refreshRates(force = false): Promise<RatesMap> {
  const now = Date.now();
  if (!force && liveRates && ratesFetchedAt && now - ratesFetchedAt < RATE_TTL_MS) {
    return liveRates;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`rates http ${res.status}`);
    const data = (await res.json()) as { result: string; rates: RatesMap };
    if (data.result === "success" && data.rates) {
      liveRates = data.rates;
      ratesFetchedAt = now;
    }
  } catch {
    // Offline or blocked: keep static table.
  }
  return liveRates ?? STATIC_RATES;
}

/** Current effective rate table (static if never refreshed). */
export function getRates(): RatesMap {
  return liveRates ?? STATIC_RATES;
}

/**
 * Convert `amount` from `from` to the app's base currency (or any target).
 * Rates are "units of X per 1 USD", so amountBase = amount / rate(X).
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode = BASE_CURRENCY,
): number {
  const rates = getRates();
  if (from === to) return amount;
  const fromRate = rates[from] ?? STATIC_RATES[from] ?? 1;
  const toRate = rates[to] ?? STATIC_RATES[to] ?? 1;
  const inUsd = amount / fromRate;
  return inUsd * toRate;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode = BASE_CURRENCY,
  opts: { decimals?: number; sign?: boolean } = {},
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  const decimals = opts.decimals ?? (currency === "JPY" ? 0 : 2);
  const sign = opts.sign && amount > 0 ? "+" : "";
  const abs = Math.abs(amount);
  return `${sign}${symbol}${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatDateShort(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
