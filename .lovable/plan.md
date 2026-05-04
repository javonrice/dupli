## The shift

Right now the app assumes: **scanned = expensive original, suggested = cheaper dupe.** Drugstore/Dollar Tree shoppers break that assumption. When someone scans a $1.25 XtraCare lotion and the AI surfaces the $40 Summer Fridays it's mimicking, today we silently suppress the "Save %" chip (because savings would be negative) and the verdict copy still implies the scanned item is the thing being evaluated.

We need to detect that case and flip the framing: **"You found a steal — 97% cheaper."** The scanned product becomes the hero, and the savings number reads as how much they saved by *already buying the cheap one*.

## Detection rule

In `normalizeAnalysis` (src/server/scan.functions.ts), after we know `original` and `headline` (the top dupe), compute:

- `isStealFind = headline.estimatedPriceUsd > original.estimatedPriceUsd * 1.25`
  - 25% buffer avoids flipping on small price noise (a $12 vs $14 swap shouldn't be a "steal")
  - Both prices must be > 0
  - Only triggers when there IS a dupe (`headline` exists)

When true, set a new field `analysis.framing = "steal-find"` (default `"classic-dupe"`). Also compute and store `savingsPct` once on the analysis object so every UI surface uses the same number:

- classic: `(original - dupe) / original * 100`
- steal: `(dupe - original) / dupe * 100` ← "this much cheaper than the name brand"

## Type changes

`src/server/scan.functions.ts` — extend `DupeAnalysis`:
```ts
framing: "classic-dupe" | "steal-find";
savingsPct: number; // 0-100, always positive
```

Both populated in `normalizeAnalysis`. No DB migration needed for `scans` — it's inside the existing `analysis` JSONB column. Old rows just default to `classic-dupe` at read time (handled in the UI components below with `?? "classic-dupe"`).

## AI prompt update

Same file, the system prompt already mentions "the scanned item is affordable/lookalike → identify the name-brand counterpart." Tighten step 12 (verdict guidance) with a steal-find clause:

> If the scanned product is meaningfully cheaper than every credible counterpart (drugstore, dollar store, off-brand), the user has FOUND A STEAL. Verdict should still reflect formula honesty ("Worth the hype" if the cheap product genuinely matches; "Mixed" if it cuts corners; "Risky dupe" if it adds irritants), but the `notes` copy should celebrate the find rather than warn about a swap.

This nudges the model to produce steal-friendly notes copy. Detection itself stays deterministic in code — we don't trust the model to set the flag.

## UI changes

### 1. `src/components/dupe-card.tsx` (the main result card)

- **Verdict bar**: when `framing === "steal-find"`, replace the "Save X%" chip with a **"You found a steal · 97% cheaper"** chip (using the actual `savingsPct`) — success green + ✨ icon, not TrendingDown. Number compares scanned price to dupe price.
- **Pair grid order**: keep "Original" on left and "The dupe" on right structurally (the AI's `original`/`dupe` semantics don't change), but **swap the visual emphasis** — in steal mode the SCANNED product gets the highlighted/featured treatment with a small "You scanned" badge, and the name-brand counterpart gets the muted treatment with a "What it's duping" label. This makes it visually obvious that the cheap thing is the win.
- **ProductSide labels**: parameterize `label` so steal mode shows "You scanned" / "What it dupes" instead of "Original" / "The dupe".
- **Lookalike band copy**: when steal mode + `dupeType === "Lookalike packaging"`, prepend "Caught a lookalike — " to the band text. This rewards the user for spotting the copycat.

### 2. `src/components/share-card.tsx`

- Same `framing` detection. Headline switches from "Save X%" to **"You found a steal · X% cheaper"** when steal.
- Subtitle copy: classic = "{Brand} {Product} → {DupeBrand} {DupeProduct}", steal = "{ScannedBrand} {ScannedProduct} dupes {NameBrand} {NameProduct}".
- This is the share asset, so the steal framing is what gets posted to TikTok/IG — high-leverage surface.

### 3. `src/components/home/community-dupe-card.tsx`

- Same chip swap when the underlying pair is a steal (derive client-side from `originalPrice` vs `dupePrice` already in the row, using the same 25% threshold). Chip reads **"Steal · X% cheaper"** in the compact card.
- Trending feed labeling: when most loved-by-community pairs are steals, this is the actual product story we want surfaced.

### 4. `src/routes/_app/community.$brand.$product.tsx` and `src/routes/_app/p.$productId.tsx`

- Same `TrendingDown → Sparkles` icon swap and chip-text swap on price-comparison badges, gated on derived steal flag (compare prices in the row).

### 5. `src/components/scan-list-item.tsx` (history)

- When `scan.analysis.framing === "steal-find"`, show a tiny ✨ badge next to the match score. No copy change — keeps the row dense.

## Trending function (small follow-up)

`public.trending_saved_dupes` already returns enough columns (we have both products' names, but not their prices). Steal-find is most exciting when surfaced in the community feed, so:

- Add `original_price_usd` and `dupe_price_usd` to the RPC return shape, pulled from `analysis->'original'->>'estimatedPriceUsd'` and `analysis->'dupe'->>'estimatedPriceUsd'` of the latest scan in each pair. One small migration.
- `community-dupe-card.tsx` then has everything it needs to render the steal chip without a second roundtrip.

## What we explicitly are NOT doing

- **No AI re-prompting / re-scanning.** Detection is purely arithmetic on the existing analysis. Zero added cost.
- **Not changing `original`/`dupe` semantics in the data.** "Original" still means "the name-brand reference," "dupe" still means "the alternative." We only flip presentation. This keeps the saved_scans aggregation, the scans table, and every existing query untouched.
- **Not touching the verdict enum.** "Worth the hype" / "Mixed" / "Risky dupe" still apply — a steal can still be risky if the cheap formula is harsh.

## Copy locked in

Headline across result card + share card + community chip: **"You found a steal · {N}% cheaper"** (compact form on small chips: **"Steal · {N}% cheaper"**). The percentage is what makes people stop scrolling and is what does the work in shareable assets.
