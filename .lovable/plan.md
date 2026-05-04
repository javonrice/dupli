## Goal

Replace the AI-hallucinated `buyUrl` with **real, verified product links** for both the original and every dupe candidate, using only free infrastructure we already have.

## Where the links come from

For each product the AI returns, run a tiered server-side resolver and stop at the first step that produces a verified URL:

```text
brand + productName
  ├─ 1. Cache lookup
  │     SELECT vendors FROM product_link_cache
  │     WHERE brand_slug = X AND product_slug = Y
  │       AND resolved_at > now() - 30 days
  │     -> instant return
  │
  ├─ 2. Live web search (the new step)
  │     Query DuckDuckGo first, fall back to Bing — same scraper
  │     pattern src/server/scan.functions.ts already uses for
  │     findProductImage.
  │     Search query: `"<brand> <product>" buy site:(amazon|target|...)`
  │     Filter results to a retailer allowlist:
  │       amazon, target, walmart, ulta, sephora, cvs, walgreens,
  │       sallybeauty, dollartree, dollargeneral, costco, kohls
  │     Verify each candidate with GET + Range: bytes=0-0, 5s timeout.
  │     Keep the top 1-3 reachable hits, normalize merchant names.
  │
  ├─ 3. Skinsort vendor cache (bonus enrichment)
  │     If our existing products + product_vendors row exists for this
  │     brand_slug/product_slug, merge any extra merchants/prices we
  │     don't already have from step 2.
  │
  └─ 4. Fallback (only when 2+3 produced nothing)
        Build retailer search URLs with existing buildQuery() +
        RETAILER_TEMPLATES, then googleShoppingLink() as last resort.
```

Every successful resolution is written back to `product_link_cache` so the next user scanning the same product gets step-1 speed.

## Database

One new table + RLS:

```sql
create table public.product_link_cache (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null,
  product_slug text not null,
  vendors jsonb not null default '[]'::jsonb,
  source text not null default 'web-search',
  resolved_at timestamptz not null default now(),
  unique (brand_slug, product_slug)
);
alter table public.product_link_cache enable row level security;
create policy "Cache readable by authenticated"
  on public.product_link_cache for select
  to authenticated using (true);
-- Writes happen via supabaseAdmin from the resolver; no INSERT policy needed.
```

`vendors` shape: `[{ merchant: string, url: string, priceUsd: number | null }]`.

## Code changes

### New files

- **`src/server/product-links.server.ts`** — server-only helpers:
  - `RETAILER_ALLOWLIST` + `normalizeMerchant(host)` (e.g. `amazon.com` → "Amazon").
  - `searchDuckDuckGo(query)` and `searchBing(query)` reusing the same fetch+parse pattern as `findProductImage`. Each returns `{ url, title }[]`.
  - `verifyUrl(url)` — `GET` with `Range: bytes=0-0`, 5s timeout, follow redirects, accept 200/206/301/302/403 (Amazon often 403s HEAD-style requests but the URL is valid; we accept it if the final host is still allowlisted).
  - `resolveProductLinks(brand, productName)` — runs the 4-step pipeline above, reads/writes `product_link_cache` via `supabaseAdmin`, hard-caps total work at 3s (returns whatever it has when the budget elapses).

### Edits

- **`src/server/scan.functions.ts`**:
  - Add `links?: { merchant: string; url: string; priceUsd: number | null }[]` to `ScannedProduct` and `DupeSuggestion`.
  - After the existing `findProductImage` `Promise.all`, run a sibling `Promise.all` of `resolveProductLinks` calls for the original + every candidate. Attach to `parsed.original.links` and each candidate's `.links`. Re-sync `parsed.dupe = candidates[0]` afterwards (already done for images).
  - Stop using `safeUrl` as the primary CTA source — keep it only as a deep fallback inside `resolveProductLinks` step 4.

- **`src/components/dupe-card.tsx`** (`ProductSide`): below the price, render up to 3 vendor chips when `item.links?.length`. Each chip is `<a href={url} target="_blank" rel="noopener noreferrer">{merchant}{price ? ` · $${price}` : ""}</a>`. Show on both the original and dupe sides.

- **`src/components/scanner.tsx`** (`ResultsScreen` bottom bar):
  - If the selected dupe has `links`, primary CTA becomes `Buy at {cheapest merchant} — ${price}` linking to that vendor URL.
  - Add a small secondary "More retailers" button that opens a sheet listing all resolved vendors.
  - If no links resolved → keep the current Google Shopping fallback button (zero regression).

## Latency budget

- Cache hit: ~50ms.
- First-time scan: search + verify in parallel across all 8 candidates ≈ 1.5–2.5s added.
- Hard 3s ceiling — we ship the analysis with whatever we have at the deadline. The scan never blocks waiting on a slow retailer.

After the first few hundred scans, popular products (CeraVe, e.l.f., Drunk Elephant, etc.) live in the cache and add basically zero latency.

## Out of scope

- Affiliate-link wrapping.
- Background re-validation of stale cache entries (TTL refresh on next scan is fine).
- Admin tooling to fix bad URLs manually.
- Swapping in a paid search API (Firecrawl / Serper / Brave) — easy to add later by replacing only the `searchDuckDuckGo` / `searchBing` functions.
