# Real data, not estimates: scrape SkinSort on demand

## What changes

Stop guessing prices and ingredients with the AI. Pull the same source SkinSort uses, store it in our DB the first time we see a product, and reuse it on every later scan.

## Where the data actually lives on SkinSort

I dug through the markup. Every SkinSort product page is fully server-rendered HTML and contains exactly what we need:

1. **Full INCI ingredients list** — `https://skinsort.com/products/{brand}/{slug}` → `<div id="ingredients_list">` with one `<a href="/ingredients/{name}">` per ingredient, in order.
2. **Real retailer prices** — `https://skinsort.com/products/{brand}/{slug}/us/vendors` → a list of `<a href="...">` rows, each with merchant logo (Target, Ulta, Amazon, Dermstore, etc.), the deep link to the retailer product page, and the **actual current price** like `$15.99`. This is the real shopping link, not a search query.
3. **Category + good-for/free-from** — already in the same product HTML; we already partially parse this.
4. **Variant id** — every product has a stable numeric id (e.g. `2216`) used in the vendors URL.

So we can know, for every SkinSort product: real ingredients, real prices, real retailer URLs.

## How we use it

### A. Extend the parser and DB

- Extend `parseSkinsortPage` (and add a sibling `parseSkinsortVendors`) in `src/server/skinsort-parser.ts` to also extract:
  - `ingredients: string[]` — ordered INCI list from `#ingredients_list`
  - `variantId: number | null` — pulled from the `vendors_product_{id}` turbo-frame id
  - `vendors: { merchant, url, priceUsd, currency }[]` — from `/us/vendors`
- DB migration on `products`:
  - add `ingredients text[] not null default '{}'`
  - add `variant_id integer`
  - add `last_priced_at timestamptz`
- New table `product_vendors`:
  - `id uuid pk`, `product_id uuid` (fk products), `merchant text`, `url text`, `price_usd numeric(10,2)`, `currency text default 'USD'`, `rank int`, `fetched_at timestamptz default now()`, unique (product_id, merchant)
- RLS: readable by authenticated, writable only by service role (matches existing pattern).

### B. Just-in-time scraper, cached forever (well — for 7 days for prices)

New helper in `src/server/skinsort-scraper.server.ts`:

- `ensureProductData(productId)` — runs server-side from the scan handler.
  1. Read the product row. Get `source_url` (or build it from `brand_slug`/`product_slug`).
  2. If `ingredients` is empty, fetch the product page, parse INCI list, write back.
  3. If `last_priced_at` is null OR older than 7 days, fetch `/us/vendors`, replace rows in `product_vendors`, set `last_priced_at = now()`.
  4. Return `{ ingredients, vendors }`.
- All work runs in parallel for the original and the dupe and is wrapped in `try/catch` — a SkinSort failure must never break a scan.
- Use a tight timeout (8 s) and a 7-day TTL for price refresh.
- Respect a small in-memory rate-limiter (e.g. 4 concurrent fetches per worker) to be a polite citizen.

### C. Wire it into the scan response

In `src/server/scan.functions.ts`, replace the lossy DB-merge block (lines ~814-839) so that when we have a verified DB hit:

- Brand / name / image / matchScore / rationale come from the DB (verified).
- Call `ensureProductData(originalId)` and `ensureProductData(dupeId)` in parallel.
- `original.estimatedPriceUsd` and `dupe.estimatedPriceUsd` come from the cheapest in-stock vendor in `product_vendors`. Field stays for compatibility but the value is now real. Add a sibling `priceSource: "skinsort_vendor"` and `priceMerchant: "Target"` so the UI can label it.
- Compute `sharedIngredients`, `uniqueToOriginal`, `uniqueToDupe` from the two real INCI lists (case-insensitive set diff/intersect, cap each list at ~6 most meaningful items, drop water/fragrance/phenoxyethanol from the "in both" tier).
- `dupe.buyUrl` and `dupe.whereToBuy` come from the top vendor row (real retailer product page, not a search URL).
- Add a new optional field on `DupeAnalysis.dupe`: `vendors: { merchant, url, priceUsd }[]` so the UI can show the full list.

If SkinSort fetch fails or returns nothing for a product, we fall back to today's behavior (AI's estimate, generic search link) — but log it so we can backfill later.

### D. UI updates in `src/components/dupe-card.tsx`

- Show real price for both sides; if either is 0, show `—` instead of `$0`.
- Only render "Save X%" when both prices are real and dupe < original.
- Keep the existing in-both / unique chip rows — they'll now have real data.
- Replace the single "Shop on Google" CTA with a small vendor row: each vendor as a chip ("Target $15.99", "Ulta $16.99", "Amazon $17.49"), tappable, opens the real retailer URL. Primary CTA = cheapest vendor.

### E. Backfill existing rows (optional, opportunistic)

No bulk job. Every scan that hits a product with empty ingredients / stale prices triggers `ensureProductData`, which writes back. Over a few weeks the popular catalog warms itself.

## What this is NOT

- No new API key. SkinSort pages are public HTML.
- No AI for ingredients or pricing — those are now sourced from real data.
- AI is still used for: the narrative `notes`, `bestFor`, risk panel, and as a fallback when SkinSort is missing the product.

## Files touched

- `src/server/skinsort-parser.ts` — add ingredients + variant id + vendors parsing
- `src/server/skinsort-scraper.server.ts` — NEW — `ensureProductData` with cache + TTL
- `src/server/scan.functions.ts` — replace DB-merge block; add `vendors`, `priceMerchant`, `priceSource` to `DupeAnalysis`
- `src/components/dupe-card.tsx` — vendor chip row, real-price guards
- New migration: `products.ingredients`, `products.variant_id`, `products.last_priced_at`, new `product_vendors` table with RLS

## Verification

After deploying:
1. Re-scan the Cremo Body Wash from your screenshot. Expect real prices on both sides, real ingredient overlap chips, and a "Target $X.XX" / "Ulta $X.XX" row instead of "Shop on Google".
2. Re-scan it 5 minutes later. Expect a noticeably faster response (cached) and zero SkinSort hits in logs.
3. Scan a product SkinSort doesn't have. Expect graceful fallback to today's behavior (no crash, log line `[skinsort] miss: …`).
