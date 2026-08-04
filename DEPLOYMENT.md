# Deployment Guide

How to ship the Expense Tracker PWA for free and install it on an iPhone.

## 1. Push to GitHub

```bash
git init && git add -A && git commit -m "feat: expense tracker PWA"
git remote add origin https://github.com/<you>/expense-tracker.git
git push -u origin main
```

## 2. Deploy to Vercel (free)

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import the repository (framework auto-detected as Next.js).
3. Use the default build settings:
   - Build: `bun run build` (or Next.js defaults)
   - Output: `next build`
4. Click **Deploy**. You get a URL like `https://expense-tracker-abc.vercel.app`.

> The app is fully client-side (IndexedDB + optional sync), so no environment
> variables are required to run. If you later add a Supabase backend, set the
> keys in Vercel → Project → Settings → Environment Variables.

### Optional: custom domain (also free)
Add a domain in Vercel (Settings → Domains). PWA install requires **HTTPS**,
which Vercel provides on all URLs including the default `*.vercel.app`.

### Production service worker note
After deploying, open the site once (to install the service worker), then open
Settings → Apps → Safari → Advanced → enable **Website data** if prompted, and
hard-refresh (`Cmd+Shift+R` on desktop) so the new `sw.js` cache version is
activated.

## 3. Install on an iPhone (Safari)

1. Open the deployed URL in **Safari** (not Chrome — iOS only allows home
   screen installs from Safari).
2. Tap the **Share** button (square with up-arrow) in the Safari toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Edit the name if you like (defaults to “Expenses” from the manifest
   `short_name`) and tap **Add**.
5. Launch from the home screen. It opens in **standalone mode** (no Safari
   address bar), uses the generated icon, and works **offline** after the first
   load thanks to the service worker.

### Make it feel native
- Turn the phone to **Dark/Light** — the app follows the system appearance.
- Swipe an expense row to delete (haptic feedback on supported devices).
- Pull down anywhere to trigger a sync.
- Add an expense by typing naturally: “Uber to airport for 25 dollars
  yesterday”.

## 4. Test the PWA locally

```bash
bun run dev --port 4000        # dev server
# or production build:
bun run build && bun run start --port 4000
```

Open `http://localhost:4000` in Chrome DevTools → Application → Manifest /
Service Workers to inspect the PWA. For iPhone testing from a dev machine, use
`npx vercel dev` or deploy a preview branch to Vercel (HTTPS is required for
service workers and camera capture).

## 5. Going multi-device (optional backend)

The sync layer already has a pluggable adapter. To enable real sync:

1. Create a Supabase project (free tier).
2. Run the `expenses` table DDL from `ARCHITECTURE.md` + enable Row Level
   Security with `auth.uid()`.
3. Implement `SupabaseRemoteAdapter implements RemoteSyncAdapter`
   (`push`, `delete`, `pull` using `updated_at` as the server clock) in
   `src/lib/db/sync.ts` and instantiate `SyncEngine` with it.

No UI or store changes required.
