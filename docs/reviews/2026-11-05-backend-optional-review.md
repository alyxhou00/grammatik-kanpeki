# Grammatik Kanpeki: static site or backend?

- **Date:** 2026-11-05
- **Code reviewed:** commit `1f4ef41` ("Merge card scheduling order (own cards before demo cards) into main")
- **Question:** should the site stay static, or does it need a backend for the planned features (login, streaks, heatmap, premium AI grading, rollout to other users)? Can the backend be optional, and can we avoid running a server?

This is a snapshot. The app will change, so check each point against the current code before acting on it. The earlier [rollout review](2026-11-04-rollout-review.md) covers the data model; this one only covers where the data lives.

## Decision

**The site is backend-optional.** It works completely as a static site, with everything stored in the browser. A backend is an add-on that a user can turn on (by signing in) to get sync across devices and the features that need a server. Nobody has to sign in to learn.

**No server of our own.** The front end stays on static hosting. When the add-on comes, it runs on a managed service (a Backend-as-a-Service or serverless functions), so there is no machine to set up, patch or keep running.

Yes, this is a sound framing. It is what "local-first" apps do: the browser holds the working copy, and the server, when there is one, only syncs and adds extras. It also keeps the DSGVO work small for as long as nobody has an account.

## What works without a backend

| Feature | Without a backend | With the add-on |
| --- | --- | --- |
| Studying, SRS, card editor, import/export | Yes (today) | Same |
| Level fit, other languages, onboarding | Yes (data-model work, see the rollout review) | Same |
| Study log, streaks, heatmap | **Yes**, from a local review log | Also synced across devices |
| Moving progress to another device | By hand: export, then import | Automatic sync |
| Login, accounts | Not needed | Yes |
| AI grading | Only with **bring your own key** (see below) | Premium users, with our key on the server |
| Premium rights, payments | No: a flag in the browser can be changed by anyone | Yes |
| Shared decks, moderation | Share files by hand | Yes |

Only premium rights and shared decks need a server. Everything else has a static version.

## Hosting without a server

- **Front end:** static hosting such as GitHub Pages or Cloudflare Pages. There is no build step, so the repo can be served as it is. GitHub Pages on a private repo needs a paid plan; check the current terms before choosing.
- **Backend add-on:** a managed service. Supabase (EU region) is a good fit: auth, Postgres with row-level security (each user can only read their own rows), and edge functions for the AI proxy. Cloudflare Workers + D1 with a separate auth provider also works, but then login, sessions and password reset are more of our own work. Check free-tier limits and prices when the time comes.
- **Sync with no backend at all:** a later option is syncing to the user's own Google Drive or Dropbox from the browser. It needs an OAuth app registration but no server. It can't do premium or shared decks.
- **AI grading with no backend:** a user can enter their own OpenRouter key in the settings. It stays in their browser (localStorage) and goes only to OpenRouter. Check that OpenRouter accepts calls from the browser (CORS) before building this. The risk: any script running on the page could read the key, so this needs the strict escaping the app already has, and a clear note in the UI. Our own key must never be in browser code; premium AI grading goes through a server function that checks the user's rights first.

## What this means for the code

1. **[`js/store.js`](../../js/store.js) is the only seam.** All persistence goes through it, except the last route (`gk.route` in `js/app.js`). Keep it that way: the UI never talks to a backend directly.
2. **The store stays synchronous and local.** Its API (`getProgress`, `setProgress`, …) is synchronous, which is right for a local-first app. The add-on is a sync module next to it: it reads local changes, sends them, and merges what comes back. With no backend configured, the sync module is not loaded and no login UI is shown.
3. **A study log is needed now.** `gk.daily.v1` only keeps today's counters and is overwritten when the day changes, so there is no history for streaks or the heatmap. Add a log that keeps every day. Per-day counts (per language) are enough for streaks and the heatmap and stay a few kilobytes a year; one entry per answer would take megabytes a year, and localStorage holds about 5 MB in total.
4. **Make data syncable before syncing it** (from the rollout review): overlays instead of copied cards, generated ids, full timestamps instead of `YYYY-MM-DD` in `updatedAt`, and versioned storage keys with a migration path. Otherwise both localStorage and the server have to be migrated later.
5. **Merging is simple if the data is shaped right:** study log = the larger count per day when importing a copy of the same history, and later, with sync, the sum of each device's own counts; progress per card = the most recent review wins; cards = per-field overlays, newest wins.

## Legal (Germany)

As long as data stays in the browser and there are no accounts, the privacy policy is short (hosting logs only). With the add-on: a DSGVO privacy policy, an Impressum, a data processing agreement with the provider, an EU region, and a way for users to export and delete their account. With paid premium also VAT and payment terms. This is another reason the add-on should wait until it is actually needed.

## Suggested order

1. **Now, static:** local study log, then streaks and a heatmap from it.
2. **Schema v3** (rollout review): overlays, generated ids, full timestamps, versioned storage.
3. **Optional, static:** bring-your-own-key AI grading.
4. **Backend add-on v1**, when friends want more than one device: sign in, sync log, progress and cards.
5. **Backend add-on v2:** premium rights, then AI grading with our key.
6. Shared decks and moderation last.
