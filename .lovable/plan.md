# Why scans feel weak (the actual problem)

The database isn't worthless — we just aren't reaching it. Three concrete issues from logs + DB inspection:

1. **Brand mismatch.** AI returns `NYX Professional Makeup`, DB stores `nyx-cosmetics`. Our slug variants only handle the `the-` prefix, so we get **0 candidates** and skip straight to a global FTS that finds a different brand at 0.52.
2. **The Ordinary scan only scored 0.60** because it matched in Tier 3 (cross-brand FTS) instead of Tier 2 (same brand). Tier 2 missed because the AI returned `Niacinamide 10% + Zinc 1% Oil Control Serum` while the DB row is `Niacinamide 10% + Zinc 1%` — Jaccard distance got dragged down by the extra "oil control serum" tokens, falling under our 0.4 floor.
3. **We never use the 109,263 dupe edges intelligently.** When a product has no rank-1 dupe we give up. We should fall through to "products with the most shared ingredients in the same DB-defined family."

What we have to work with: 46,689 products, **109,263 SkinSort dupe edges** with `ingredient_match` / `attribute_match` / `shared_ingredients_count` / `rationale`, full `search_vector` on every product, brand storefront images on 99% of rows. We do **not** have populated `category`, `free_from`, `good_for`, `contains`, or per-product ingredient lists — so any "bottle type" / "formula" matching has to be derived from product names + the dupe graph SkinSort already computed for us.

# The plan: a 5-tier resolver, then a graph walk

No extra AI call needed. The lookup itself stays deterministic SQL; AI is only the fallback if all 5 tiers fail.

## Tier 1 — Exact slug (unchanged)
`brand_slug` IN variants AND `product_slug` = exact. Already works when the AI happens to be exact.

## Tier 2 — Brand alias resolution (NEW, fixes NYX class of bugs)
Replace the tiny `the-/no-the-` variant list with a real normalizer that strips and adds common brand suffix noise the AI loves to append:

- strip: `professional`, `makeup`, `cosmetics`, `beauty`, `skincare`, `skin-care`, `paris`, `london`, `new-york`, `co`, `inc`
- also try the first 1-2 tokens of the brand alone (`nyx-professional-makeup` → `nyx`)
- also try `the-` prefix toggle (already there)

Build a `Set<string>` of every plausible slug, then `WHERE brand_slug IN (...)`. With this, NYX hits, L'Oréal Paris hits, Maybelline New York hits, etc.

## Tier 3 — Brand-scoped fuzzy (current Tier 2, with smarter scoring)
Same brand candidates, but rank with:

- Jaccard on tokens (current)
- **plus** trigram similarity on the full normalized name (catches "Niacinamide 10% + Zinc 1%" ≈ "Niacinamide 10% + Zinc 1% Oil Control Serum")
- **plus** a "core actives" bonus: if both names contain the same headline ingredient token (`niacinamide`, `retinol`, `salicylic`, `vitamin-c`, `hyaluronic`, etc.), +0.15
- drop floor from 0.4 → 0.35 once these signals are in

This is the single biggest win for "almost the right name in the right brand."

## Tier 4 — Cross-brand FTS (current Tier 3, raised floor)
Keep at 0.6 minimum overall. Already prevents the "Life / Niacinamide" misfire.

## Tier 5 — NEW: Sibling product fallback
When Tiers 1-4 return a product but that product has **no rows in `dupes`** (or the AI's brand was unknown but Tier 3 still found a brand match), pivot to the dupe graph:

1. Take the matched product.
2. Look up its top 5 `dupes` rows ordered by `overall_match DESC`.
3. If still empty, find products with the **highest token overlap on product name within a different brand** and a similar headline-active token, then surface the one our database itself rates highest.

We already have these 109k edges precomputed by SkinSort — use them as the source of truth for matchScore (they range 70-100, much more confident than our current 0.6 fuzzy score).

## Score surfacing
Right now we display `top.overall_match` (0-100 from SkinSort) but only when Tier 1/2 hit. Make every successful tier surface the SkinSort score from the dupe row, never the fuzzy lookup score. The lookup score is for *ranking candidates*, not for telling the user how good the dupe is. That's why The Ordinary said "60" — we showed the FTS confidence instead of the dupe's real 90+ ingredient match.

## Don't queue garbage
If the AI returns a brand starting with `Unbranded`, `Generic`, `Store Brand`, or empty/unknown, skip ingestion-queue insertion entirely. We saw `Unbranded (Dollar General)` queued — that will never resolve.

# What we are intentionally NOT doing

- **No second AI call for matching.** The user explicitly wanted to wait on that. The 5-tier resolver above should handle 80%+ of the misses we're seeing without spending more credits.
- **No schema change.** The columns we'd want for "bottle type / category" matching (`category`, `contains`) are empty across all 46k rows. Backfilling them is a separate, larger ingestion project — flag it for later, don't block this fix on it.
- **No re-ingestion.** SkinSort already gave us the dupe graph; we just need to walk it.

# Files touched
- `src/server/scan.functions.ts` — replace `brandSlugVariants`, `findProductSmart`, `rankBySimilarity`, and the `crossReferenceDupeDb` score-surfacing block. Add the unbranded-skip guard.

# Acceptance check (on you to retry after deploy)
- Scan an NYX product → logs show `nyx-cosmetics` in variants, Tier 2/3 hits, score reflects SkinSort's 80+ overall_match, not 0.60.
- Re-scan The Ordinary Niacinamide → matches `the-ordinary` in Tier 2 (not Tier 3), score shows the real SkinSort dupe rating.
- Scan something genuinely not in DB → logs show "no-match" diagnostics with full variant list, no `Unbranded` rows queued.
