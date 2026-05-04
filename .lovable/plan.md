# Save-Driven Trending (with Skinsort fallback for cold start)

## The shift

A scan = curiosity. A save = a vote. "Popular / trending / dupe of the day" should ultimately rank by `saved_scans`. But until we have enough save volume, the home screen would look empty — so we keep the Skinsort-mirrored catalog (`products`, `dupes`, `product_vendors`) as a fallback source. No deletes yet. We add the save-driven path next to the existing one and blend them.

## What we keep (no changes for now)

- Entire Skinsort ingestion path: `products`, `dupes`, `product_vendors`, `ingestion_queue` tables; `skinsort-parser.ts`, `skinsort-slugs.ts`, `skinsort-vendors-parser.ts`, `dupes.functions.ts`, `product-links.server.ts`, the three `/api/public/hooks/*` webhooks.
- `discover.functions.ts` — `getDupeOfTheDay`, `getTrendingDupes`, `getCommunityDupe`, `getProductDetail` keep working exactly as today.
- Routes `_app/p.$productId.tsx` and `_app/community.$brand.$product.tsx` — unchanged.
- Scan flow (`scan.functions.ts`, `scans.functions.ts`, `useScanFlow`, results screen, save toggle) — unchanged.

This is the safety net. If saves are sparse, the hub still looks alive.

## What we add

A second, save-driven data path that augments (and eventually replaces) the catalog-driven one.

### 1. New SQL function: `public.trending_saved_dupes`

`security definer`, returns aggregated rows from `saved_scans` joined to `scans`, grouped by the four name fields. The dominant spelling wins by save count automatically.

```sql
create or replace function public.trending_saved_dupes(
  p_limit int default 20,
  p_min_saves int default 2,        -- threshold below which we treat it as cold-start
  p_window_days int default null    -- null = all time, otherwise last N days
)
returns table (
  pair_key text,
  latest_scan_id uuid,
  save_count bigint,
  last_saved_at timestamptz,
  original_brand text,
  original_product_name text,
  original_image_url text,
  dupe_brand text,
  dupe_product_name text,
  dupe_image_url text,
  match_score int,
  verdict text
)
language sql stable security definer set search_path = public as $$
  select
    md5(lower(s.original_brand)||'|'||lower(s.original_product_name)||'|'||
        lower(coalesce(s.dupe_brand,''))||'|'||lower(coalesce(s.dupe_product_name,''))) as pair_key,
    (array_agg(s.id order by ss.created_at desc))[1] as latest_scan_id,
    count(distinct ss.user_id) as save_count,
    max(ss.created_at) as last_saved_at,
    -- pick the most-recent spelling as the canonical display
    (array_agg(s.original_brand        order by ss.created_at desc))[1],
    (array_agg(s.original_product_name order by ss.created_at desc))[1],
    (array_agg(s.original_image_url    order by ss.created_at desc))[1],
    (array_agg(s.dupe_brand            order by ss.created_at desc))[1],
    (array_agg(s.dupe_product_name     order by ss.created_at desc))[1],
    (array_agg(s.dupe_image_url        order by ss.created_at desc))[1],
    (array_agg(s.match_score           order by ss.created_at desc))[1],
    (array_agg(s.verdict               order by ss.created_at desc))[1]
  from saved_scans ss
  join scans s on s.id = ss.scan_id
  where s.dupe_product_name is not null
    and (p_window_days is null or ss.created_at >= now() - (p_window_days || ' days')::interval)
  group by 1
  having count(distinct ss.user_id) >= p_min_saves
  order by save_count desc, last_saved_at desc
  limit p_limit;
$$;

grant execute on function public.trending_saved_dupes(int, int, int)
  to authenticated, anon;
```

Granted to `anon` so SSR + unauth landing can call it. Function aggregates only — no PII leaks.

### 2. New file: `src/server/trending.functions.ts`

Two server functions, each tries the save path first and falls back to the catalog path.

```text
getDupeOfTheDayBlended()           -> { dupe, source: "saved" | "catalog" }
getTrendingDupesBlended({ limit }) -> { dupes, source: "saved" | "catalog" }
```

Both reuse the existing `CommunityDupe` shape so the UI doesn't have to branch. To do that we adapt save-aggregated rows into `CommunityDupe` with synthetic ids:

- `id`: the `pair_key` from the SQL function (used as React key + tap target). Prefixed `saved:<hash>` so we can tell which source it came from.
- `original.id` / `dupe.id`: empty string (we won't navigate to `/p/$productId` for save-sourced cards — see tap target below).
- `original.brandSlug` / `productSlug`: derived via existing `slugify()` from `skinsort-slugs.ts`.
- `lowestPriceUsd`: `null` (we don't have catalog price for save-sourced rows yet).
- `imageUrl`: from the scan rows.

`getTrendingDupesBlended` flow:
1. Call `trending_saved_dupes(p_limit, p_min_saves: 2)`.
2. If the result has `>= ceil(limit / 2)` rows, return them as `source: "saved"`.
3. Otherwise call existing `getTrendingDupes({ limit })` and return as `source: "catalog"`.
4. Once save volume grows, we can later interleave both — but v1 is binary, no ranking math to debug.

`getDupeOfTheDayBlended`:
- Pull top 50 saved pairs (`p_min_saves: 2`). If at least 1 row exists, deterministic UTC-day pick.
- Otherwise fall back to existing `getDupeOfTheDay`.

Tunable thresholds (`p_min_saves`, fallback ratio) live as constants at the top of `trending.functions.ts` so we can flip them without a migration as save volume grows.

### 3. Tap target for save-sourced cards

Catalog cards link to `/p/$productId` (works because they have a real product id).
Save-sourced cards have no product id, so they link to `/scan/$id` using `latestScanId`. The existing read-only scan view already handles "viewing someone else's scan" because `scans.user_id` isn't required on the route — confirm the route's `getScan` server function (currently auth-scoped by RLS to `auth.uid()`). Two options:

- **A.** Add a new public `getPublicScan` server function (admin client) that returns scan + analysis but strips PII (`user_id`). Route `_app/scan.$id.tsx` calls the public version when the scan isn't owned by the current user. Cleaner.
- **B.** Quick hack: a new route `_app/dupe.$pairKey.tsx` that just renders the four name fields + images from the trending row passed via search params. No DB read. Works but feels hollow.

Recommend **A** — it's the right shape long-term and unlocks shareable scan links.

### 4. Hub wiring

`src/routes/_app/app.tsx`: swap `getDupeOfTheDay` → `getDupeOfTheDayBlended`, `getTrendingDupes` → `getTrendingDupesBlended`. Section header text becomes dynamic on `source`:

- `"saved"` → "Trending this week" / "Loved by the community"
- `"catalog"` → "Trending dupes" (today's copy)

Everything else stays. `RecentScansSection`, `ForYouGrid`, `DupeOfTheDay` components don't change.

## Migration

One migration: create `public.trending_saved_dupes()` + grants. No drops, no schema changes to existing tables.

## Files touched

- **Add:** `src/server/trending.functions.ts`, one DB migration, optionally `getPublicScan` in `src/server/scans.functions.ts`.
- **Edit:** `src/routes/_app/app.tsx` (swap two imports + header copy), `src/components/home/community-dupe-card.tsx` + `dupe-of-the-day.tsx` (route to `/scan/$id` when `id` starts with `saved:`).
- **Delete:** nothing.

## When we revisit (the cleanup pass)

Trigger: `trending_saved_dupes(limit:20, p_min_saves:3)` consistently returns ≥ 12 rows for ≥ 14 days.

At that point we run the deletion pass from the previous version of this plan: drop `products` / `dupes` / `product_vendors` / `ingestion_queue`, delete the Skinsort parsers, delete the ingestion webhooks, delete `getCommunityDupe` / `getProductDetail` / the catalog routes, and remove the fallback branch from `trending.functions.ts`.

Until then: dual-source, save path leads when it has signal, catalog covers cold start.
