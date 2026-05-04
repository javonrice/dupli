## Two related issues to fix

### 1. Trending dupes cards on the home screen are confusing

The current `CommunityDupeCard` (`src/components/home/community-dupe-card.tsx`) stacks two product images side‑by‑side with a tiny match-% chip floating between them, then lists Original / Dupe text below with a single price at the very bottom. It's unclear which image is the original vs the dupe, which price belongs to which product, or why one is a "steal." On a 200px-wide rail card the truncation makes it worse.

**Redesign — one clear vertical card:**

```text
┌─────────────────────────┐
│   [DUPE image, large]   │   ← the dupe is the hero
│                         │
├──── 92% MATCH ──────────┤   ← clear match pill, full width
│ CERAVE                  │
│ Moisturizing Cream      │   ← dupe brand + name (emphasized)
│ $14.99                  │   ← dupe price (big, tabular)
├─────────────────────────┤
│ dupe for                │
│ [tiny img] La Mer       │   ← original as small reference row
│           Crème · $190  │
└─────────────────────────┘
   STEAL · 92% CHEAPER       ← optional badge overlaid on hero
```

Specifics:
- Hero = the **dupe** product image (square, full card width). The dupe is what the user buys, so it leads.
- Match-% becomes a full-width divider pill (`92% match`) — no more floating chip you can't read.
- Dupe brand (uppercase tracking), product name (display font, 2-line clamp), and price stack cleanly underneath.
- "Dupe for" footer row shows the original as a small 32px thumbnail + brand/name + crossed-out-feel price, so the comparison is unambiguous.
- Steal badge (when `detectSteal` returns a value) overlays the top-left of the hero image as a bold pill (`★ STEAL · 40% off`) instead of a tiny inline chip.
- Keep both `variant="card"` (200px rail) and `variant="tile"` (grid) — the layout works identically, just different widths.
- Keep the existing `dupeLinkProps` routing (saved scans → `/scan/$id`, catalog → `/p/$productId`).

This is purely a visual rewrite of `src/components/home/community-dupe-card.tsx`. No data shape changes, no server changes.

### 2. Scan results "Also could be a dupe" rail should include SkinSort dupes

Today the rail (`src/components/scanner.tsx` lines 225–280) only shows `analysis.dupes` from the AI scan — typically 2–6 candidates. The SkinSort-mirrored database (`dupes` table, queried by `lookupDupes` in `src/server/dupes.functions.ts`) already has up to 10 community-validated dupes per known product, but they're never surfaced on the scan screen.

**Wire SkinSort dupes into the scan result:**

1. In `scanProduct` (`src/server/scan.functions.ts`), after the AI analysis is built and we know `parsed.original.brand` + `parsed.original.productName`, call the same DB query `lookupDupes` uses (read products by `brand_slug`+`product_slug`, then `dupes` table joined to dupe products).
2. Convert each SkinSort row into a `DupeSuggestion` shape:
   - `productName`, `brand`, `category`, `imageUrl` from the joined product
   - `matchScore` = `overall_match`
   - `estimatedPriceUsd` = the joined product's `lowest_price_usd` (0 if missing — UI already handles that)
   - `dupeType: "Formula dupe"`, `riskLevel: "Comparable"` defaults
   - `notes` = `rationale` (so the verdict text isn't empty)
   - empty arrays for ingredient breakdowns (we don't have per-pair detail)
3. **Randomly sample 3–4** of these (cap configurable, default 4) using a deterministic shuffle seeded by `parsed.original.brand+productName` so the same scan always returns the same picks but different products feel varied.
4. **Merge into `parsed.dupes`**, after the AI candidates, then **dedupe** by `slugify(brand)+"/"+slugify(productName)` so we don't show the same product twice if AI and SkinSort agree.
5. Cap the merged total at ~8 so the rail stays scrollable but not endless. The AI's top pick stays the headline (index 0); SkinSort additions live purely in the "Also could be a dupe" rail.
6. Run `resolveProductLinks` for the SkinSort-sourced candidates too, inside the existing `Promise.all` so they get real buy buttons just like AI candidates.

**Failure modes handled:**
- Product not in DB → `lookupDupes` already returns `{ found: false }`; we just skip the merge silently and enqueue ingestion (already does).
- DB query throws → wrap in try/catch, log, fall back to AI-only dupes (never block the scan).
- SkinSort dupe has no price → keep it in the list; the rail card already gracefully shows nothing when `estimatedPriceUsd` is 0 (we'll add a small `—` fallback in the alternates rail in scanner.tsx so it doesn't render `$0`).

No schema changes, no migrations. Pure read of existing `products` + `dupes` tables.

## Files changed

- `src/components/home/community-dupe-card.tsx` — full visual rewrite (single hero, clear match pill, original-as-footer reference, prominent steal badge).
- `src/server/scan.functions.ts` — after AI parse: query DB for SkinSort dupes of the scanned product, sample 3–4, merge into `parsed.dupes` with dedupe + link resolution.
- `src/components/scanner.tsx` — guard against `$0` price display in the alternates rail (small polish so SkinSort items without prices look clean).