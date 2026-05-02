## The problem

Right now `crossReferenceDupeDb` requires an **exact slug match**:

- AI returns: `CeraVe / Hydrating Facial Cleanser` → slug `cerave/hydrating-facial-cleanser`
- DB has: `CeraVe / Hydrating Cleanser` → slug `cerave/hydrating-cleanser`
- **MISS**, even though the product is right there.

I confirmed this against real data: CeraVe alone has dozens of variants (`hydrating-cleanser`, `hydrating-cleanser-bar`, `hydrating-cream-to-foam-cleanser`, `foaming-facial-cleanser`...). The AI rarely returns SkinSort's exact wording. That's why your 3 scans all came back empty despite 47k products in the DB.

## The fix: 3-tier fuzzy lookup

Replace the single slug query with a smarter `findProductSmart(brand, productName)` that tries progressively looser matches.

```text
TIER 1 — Exact slug                              (current behavior, kept)
  e.g. cerave / hydrating-cleanser
       → instant hit, sub-10ms

TIER 2 — Same brand, fuzzy product name          (NEW)
  Pull all CeraVe products (≤ a few hundred rows, indexed on brand_slug),
  rank in JS using token-set Jaccard similarity:
    "Hydrating Facial Cleanser" tokens: {hydrating, facial, cleanser}
    "Hydrating Cleanser"        tokens: {hydrating, cleanser}
    Jaccard = 2/3 = 0.67  →  HIT
  Threshold: score ≥ 0.4

TIER 3 — Cross-brand full-text search            (NEW, last resort)
  Use the existing `search_vector` GIN index with `to_tsquery('simple', ...)`.
  Catches cases where AI got the brand slightly wrong.
  Threshold: score ≥ 0.5 with a +0.15 bonus when the brand name still matches.
```

I verified the FTS index works: querying `'hydrating | facial | cleanser'` against `search_vector` returns "Hydrating Cleanser" as a top result for CeraVe.

## Other improvements bundled in

1. **Update displayed name to the verified one** — when we match `Hydrating Facial Cleanser` → `Hydrating Cleanser`, show the canonical name so the user sees what's actually in our DB (and so the share card / history reflect reality).
2. **Log every lookup** — `[dupedb] HIT via brand_fuzzy(0.67): "..." -> "..."` so we can watch hit-rate in worker logs and tune thresholds.
3. **Stopwords** — strip filler words (`the, and, with, for`) from tokens so they don't dilute similarity scores.
4. **Length penalty** — prevent matching `Hydrating Cleanser` with the much longer `Hydrating Mineral Sunscreen SPF 30 Face Lotion` just because they share one token.

## Files changed

- `src/server/scan.functions.ts` — replace `crossReferenceDupeDb` with the smarter lookup; add `findProductSmart`, `tokenize`, `rankBySimilarity` helpers. (~120 lines diff, all internal — no API or schema changes.)

## What this doesn't do (yet)

- No `pg_trgm` extension or stored procedure — pure JS ranking is fast enough for ≤500 candidates per brand and avoids a migration. If we later want sub-10ms cross-brand fuzzy matching at scale, we add `pg_trgm` indexes + a Postgres function in a follow-up.
- Still strict "DB-only" mode — AI is only used to identify the scanned product; the dupe itself comes 100% from our DB. If TIER 1/2/3 all miss, we still return "No dupe found" and enqueue.

## Expected outcome

Hit-rate jumps from probably <20% (exact slug) to 70–85% on popular brands. The 109k dupe pairs we already loaded actually start surfacing.

Approve and I'll ship it, then you scan the same 3 products again and we'll see live hits in the logs.
