# Expense Tracker — Architecture

An offline-first, iOS-optimized Progressive Web App built with Next.js (App
Router), Tailwind CSS v4, Zustand, IndexedDB and Recharts.

## Tech stack

| Layer          | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Framework      | Next.js 15 (App Router, React 19)                                       |
| Styling        | Tailwind CSS v4 (+ `tw-animate-css`, shadcn/ui components)             |
| State          | Zustand (in-memory mirror + async IndexedDB persistence)               |
| Offline DB     | IndexedDB (hand-rolled promise wrapper, zero deps)                     |
| Sync           | Outbox pattern + pluggable remote adapter (`lib/db/sync.ts`)           |
| Charts         | Recharts                                                               |
| Icons          | lucide-react                                                           |
| PWA            | Static `public/manifest.json`, hand-written service worker, generated icons |
| OCR            | Tesseract.js (dynamically imported, never in the initial bundle)       |
| Haptics        | Web Vibration API (maps to Taptic Engine on iOS)                       |

## Folder structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout: iOS meta tags, viewport, theme, SW provider
│   ├── page.tsx                # Renders <AppShell/>
│   └── globals.css             # Tailwind theme + iOS safe-area utilities
├── components/
│   ├── providers/
│   │   └── app-providers.tsx   # Bootstraps store hydration, rates refresh, SW registration
│   ├── layout/
│   │   ├── app-shell.tsx       # Fixed h-dvh shell: header, tab content, tab bar, drawers
│   │   ├── bottom-tab-bar.tsx  # iOS-style tab bar (Home/Stats/Subs/Split/Coach)
│   │   └── pull-to-refresh.tsx # Custom pull-to-refresh gesture
│   ├── dashboard/
│   │   └── dashboard-view.tsx  # Balance card, trend chart, categories, recent list
│   ├── expense/
│   │   ├── expense-input-sheet.tsx  # NLP entry sheet (speech, OCR, chips, split)
│   │   └── expense-list.tsx         # Swipe-to-delete rows + undo toast
│   ├── analytics/stats-view.tsx     # Monthly bars, category donut, cash-flow forecast
│   ├── subs/subscriptions-view.tsx  # Renewal manager
│   ├── split/split-view.tsx         # Settlement tracking
│   ├── coach/coach-view.tsx         # AI coach (insights + chat)
│   └── ui/                          # shadcn/ui primitives
├── hooks/
│   ├── use-haptic.ts           # Vibration API presets
│   ├── use-online.ts           # Reactive connectivity
│   ├── use-offline-sync.ts     # Sync state + auto-sync on reconnect
├── lib/
│   ├── types.ts                # Domain models (Expense, Subscription, Split, …)
│   ├── constants.ts            # Currencies, categories, budgets
│   ├── currency.ts             # Multi-currency conversion (static + live rates)
│   ├── nlp.ts                  # Natural-language parser (amount/date/merchant/category)
│   ├── analytics.ts            # Charts data, forecast, coach insights engine
│   ├── ocr.ts                  # Receipt OCR (Tesseract.js, graceful fallback)
│   └── db/
│       ├── idb.ts              # Promise-based IndexedDB wrapper
│       ├── repository.ts       # Record factory + persistence helpers
│       └── sync.ts             # Outbox sync engine + pluggable remote adapter
└── store/
    └── expense-store.ts        # Zustand store (expenses, subscriptions, actions)
```

## Offline-first data flow

```
        UI component
            │  (Zustand selector)
            ▼
   expense-store.ts ──── in-memory mirror
            │
            │  makeExpense() → saveExpense()
            ▼
   IndexedDB (expenses / subscriptions)      ← instant, offline
            │
            │  enqueueSync(op)
            ▼
   syncQueue (outbox)
            │
   ┌────────┴───────────────┐
   │  online?  ──no──► wait │
   └────────┬───────────────┘
            ▼
   SyncEngine.sync()
     1. push outbox → RemoteSyncAdapter
     2. pull(serverClock) → merge last-writer-wins by updatedAt
```

Key invariant: **every mutation lands in IndexedDB before the UI resolves**,
so the app is fully usable offline. The outbox is drained automatically when
`online` events fire (`useOfflineSync`).

## Database schema

### Local (IndexedDB, `expense-tracker` v1)

| Store          | Key    | Index(es) |
| -------------- | ------ | --------- |
| `expenses`     | `id`   | `date`    |
| `subscriptions`| `id`   | —         |
| `syncQueue`    | `id`   | —         |
| `meta`         | `key`  | —         |

`Expense` record (subset):

```ts
{
  id, type: "expense" | "income",
  amount, currency, amountBase,     // amountBase = converted to user's base currency
  category, merchant, note, date,   // date = yyyy-MM-dd
  createdAt, updatedAt, deleted, dirty,
  split?: { participants: [{ id, name, share }], settledBy: Record<string,string> },
  receipt?: { name, mimeType, dataUrl }
}
```

Soft deletes (`deleted: true`) act as tombstones so deletes propagate across
devices. Records are only hard-purged after a successful sync.

### Remote (production — Supabase/Firebase)

For multi-device sync, mirror the same tables server-side:

```sql
create table expenses (
  id text primary key,
  user_id uuid references auth.users,
  data jsonb not null,          -- the full Expense record
  updated_at timestamptz not null default now()
);
create index on expenses (user_id, updated_at);
```

Because the sync engine is adapter-based, swapping `DemoRemoteAdapter` for a
`SupabaseRemoteAdapter` requires **zero changes** to the store or UI. See
`lib/db/sync.ts` for the `RemoteSyncAdapter` contract.

## iOS PWA configuration

- **`public/manifest.json`** — `display: "standalone"`, `scope`/`start_url` at
  `/`, maskable icon, shortcuts.
- **Root layout metadata** — `appleWebApp.capable`, `.statusBarStyle:
  "black-translucent"`, `viewportFit: "cover"`, `theme-color` per scheme,
  `formatDetection: false`, `apple-touch-icon` (180px PNG — iOS ignores the
  manifest icon list for the home-screen icon).
- **`public/sw.js`** — app-shell precache, network-first navigations, offline
  fallback. iOS supports service workers since 11.3; this is what makes
  standalone + offline work.
- **Safe areas** — `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`,
  `pb-safe-tab` utilities built on `env(safe-area-inset-*)`, plus a
  `h-app` (`100dvh` with `100vh` fallback) shell.
- **Haptics** — `useHaptic()` wraps `navigator.vibrate()` (Taptic Engine).
- **Pull-to-refresh** — the shell root is `h-app overflow-hidden` (no document
  scroll), so native iOS pull-to-refresh never fires; `PullToRefresh` owns the
  gesture and triggers a sync.

## AI Financial Coach

`lib/analytics.ts` ships a deterministic, offline rule engine
(`getCoachInsights`, `buildCoachReply`) that detects:
- categories over/approaching budget,
- duplicate subscriptions,
- negative cash flow / savings margin,
- 30-day cash-flow projections.

A real LLM can replace `buildCoachReply` behind the same signature (or via a
server route) without touching the UI.

## Scripts

| Script                        | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `bun run dev --port 4000`     | Dev server                           |
| `bun run typecheck`           | TypeScript check                     |
| `bun scripts/generate-icons.mjs` | Regenerate PWA PNG icons (zero deps) |
