## Trending: switch from "pairings" to "originals with N dupes"

The hub's trending section should be **one card per original product**. The original is the hero photo + name; below it, "N dupes from $X avg". Tap → product detail page (already exists at `/p/$productId`) which shows the dupes for that original.

### What changes

**1. New server function `getTrendingOriginals`** (in `src/server/discover.functions.ts`)

Pulls the `dupes` table (overall_match ≥ 70, top ~limit×24 rows), groups by `original.id`, and returns:

```ts
type TrendingOriginal = {
  id: string;                          // original product id
  original: { id, brand, productName, imageUrl, lowestPriceUsd, ... };
  dupes: ProductLite[];                // up to 4 dupe previews
  dupeCount: number;                   // total available
  avgDupePriceUsd: number | null;      // mean of priced dupes
  minDupePriceUsd: number | null;      // cheapest dupe
  bestMatch: number;                   // top overall_match in group
  maxSavingsPct: number | null;        // best % savings vs original
};
```

Ranked by `bestMatch * log(1 + dupeCount)` so an original with many strong dupes outranks a one-off.

**2. New `getTrendingOriginalsBlended`** in `src/server/trending.functions.ts`

Mirrors `getTrendingDupesBlended`: prefer save-driven (group `trending_saved_dupes` rows by their original brand/product), fall back to `getTrendingOriginals`. Same `MIN_SAVES` / `SAVE_PATH_COVERAGE` tunables.

**3. New `CommunityOriginalCard`** (new file `src/components/home/community-original-card.tsx`)

```text
┌──────────────────────────┐
│                          │
│      [original image]    │   square hero, full card width
│                          │
├──────────────────────────┤
│ DRUNK ELEPHANT      $68  │   brand · price (original price)
│ Protini Polypeptide      │   product name, 2-line clamp
│                          │
│ ◆ 7 dupes from $14 avg   │   summary line: count · avg price
│   ▢ ▢ ▢ ▢                │   tiny dupe thumbnail strip (up to 4)
└──────────────────────────┘
   [SAVE 79%] badge top-right of hero when maxSavingsPct ≥ 25
```

- `variant="card"` (rail, 220px wide) and `variant="tile"` (grid, full width) — same component, only image/text scale.
- Tap → `/p/$productId` using `original.id`. (No need for the `saved:` scan-link branch since this card always represents a catalog product. The save-driven path still emits `original.brandSlug/productSlug` so we route to `/community/$brand/$product` for the saved-only case where original.id is empty.)
- Tiny dupe strip is decorative — 4 small avatars with `ShoppingBag` fallback. Reinforces "real dupes exist, here's a peek."

**4. Rewrite `community-feeds.tsx`**

- Replace `TrendingRail` and `ForYouGrid` so they accept `TrendingOriginal[]` and render `CommunityOriginalCard`.
- Same section headers, same layout shells.

**5. Update `src/routes/_app/app.tsx`**

- Swap `getTrendingDupesBlended` → `getTrendingOriginalsBlended` for the `trending` and `popular` state.
- Type updates: `TrendingOriginal[]` instead of `CommunityDupe[]`.
- Dedup `popular` against `trending` by `original.id`.
- `DupeOfTheDay` and `RecentScansSection` stay untouched (they're pairing-based and that's correct for those moments).

**6. Leave alone**

- `CommunityDupeCard` (still used by `p.$productId.tsx` for "Dupes for this" / "Also a dupe for" — those sections ARE about pairings, by design).
- `dupe-of-the-day.tsx` — single editorial pairing, keep as-is.
- `community.$brand.$product.tsx` route — still useful for save-path links.

### Files touched

- **edit** `src/server/discover.functions.ts` — add `TrendingOriginal` type + `getTrendingOriginals`
- **edit** `src/server/trending.functions.ts` — add `getTrendingOriginalsBlended`
- **new** `src/components/home/community-original-card.tsx`
- **edit** `src/components/home/community-feeds.tsx` — rewrite props/usage
- **edit** `src/routes/_app/app.tsx` — swap server fn + state types
