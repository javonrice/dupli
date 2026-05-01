## Goal

Make the ingredient match score feel earned, not arbitrary. Today users see "78%" with no evidence. Add a visual breakdown showing **which actives both products share** vs **what's unique to each side**, so the score has visible context — and let the AI explain *why* the dupe matches contextually (skin concern, texture, finish), not just by ingredient list.

## What changes for the user

Below the existing "Ingredient match" meter, a new **Formula breakdown** section:

```text
Both products
[Niacinamide] [Hyaluronic Acid] [Glycerin]

Only in original                Only in the dupe
[Bakuchiol] [Squalane]          [Vitamin E] [Panthenol]

Why they match
"Both target dehydrated, dull skin with a lightweight humectant
base. The dupe swaps bakuchiol for panthenol — gentler but less
firming."
```

- **Shared ingredients** rendered as filled pills (high-confidence visual = "yes, this overlaps").
- **Unique ingredients** rendered as outlined pills under each side, color-muted.
- A short **context match** sentence from the AI explains *why* this is a real dupe (skin concern, texture, finish, vibe) — separate from the existing notes, which stay focused on the esthetician verdict.

## Technical changes

**`src/server/scan.functions.ts`**
- Extend the `analyze_dupe` tool schema with two new required fields:
  - `sharedIngredients: string[]` — actives present in both formulas (canonical INCI names, deduped).
  - `uniqueToOriginal: string[]` / `uniqueToDupe: string[]` — actives only in one side.
  - `contextMatch: string` — 1 sentence on *why* the products serve the same need (concern, texture, finish), distinct from the esthetician `notes`.
- Update the system prompt so the model populates these consistently and keeps each list to ~3–6 items, prioritizing meaningful actives over filler.
- Extend `DupeAnalysis` type with those fields (all optional on the type to stay safe if the model omits them, but required in the schema).

**`src/components/dupe-card.tsx`**
- New `IngredientBreakdown` subcomponent rendered below the match meter, only when `dupe` exists and at least one of the three lists is non-empty.
- Layout: shared row on top (full width, centered), then a 2-column grid mirroring the product pair above for unique ingredients. Pills reuse the existing `bestFor` chip style for visual consistency.
- Add the `contextMatch` line above the breakdown in italic muted text so it reads as an explanatory caption.

## Out of scope

- No backend persistence — this is a per-scan view.
- No ingredient hover/tooltips with INCI definitions (could be a follow-up).
- No re-ranking of the match score; the AI continues to set it.
