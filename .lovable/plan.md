## Goal

Reskin the top half of `DupeCard` (verdict bar + product pair) to mirror the `ShareCard` layout, with "You found a steal" given a stronger, hero treatment — but still tasteful, not the bright green pill we just killed.

Everything below the pair (ingredient match, formula breakdown, risk panel, notes) stays exactly as is.

## New top-half structure

Replicates the share card top-to-bottom:

```text
┌────────────────────────────────────────────────────┐
│ [verdict pill]                    [risk pill]      │  ← header row (small)
│                                                    │
│  YOU FOUND A STEAL                                 │  ← eyebrow, success-green, tracked
│  96% cheaper                                       │  ← huge display number
│  $1 vs $34 name brand                              │  ← price subtitle
│                                                    │
│  ┌──────────────┐   ┌──────────────┐               │
│  │ YOU SCANNED  │   │ WHAT IT DUPES│               │  ← two product cards
│  │   [image]    │   │   [image]    │     side-by-  │
│  │   Brand      │   │   Brand      │     side, the │
│  │   Name       │   │   Name       │     scanned   │
│  │   $1.25      │   │   $34        │     one has a │
│  └──────────────┘   └──────────────┘     dark accent│
└────────────────────────────────────────────────────┘
```

In **classic-dupe** mode the eyebrow says "We found the dupe", display reads "Save 42%", subtitle "$40 → $12", and the dupe card gets the accent (matches share card behavior).

## Specifics

In `src/components/dupe-card.tsx`:

1. **Replace the existing verdict bar** (lines 75–96) with a new `<header>` block that:
   - Top mini-row: verdict chip on the left (smaller version of current verdict styling), risk chip on the right (move the risk chip up here from the lookalike band so it's prominent).
   - Eyebrow line: `YOU FOUND A STEAL` / `WE FOUND THE DUPE` — `text-[11px] font-bold uppercase tracking-[0.22em]`, color `text-success` when steal else `text-muted-foreground`.
   - Display headline: `{savings}% cheaper` (steal) or `Save {savings}%` (classic) — `font-display text-5xl font-extrabold tracking-tight leading-none`.
   - Subtitle: steal → `<strong>$1</strong> vs $34 name brand`; classic → `$40 → <strong>$12</strong>` — `text-sm text-muted-foreground mt-1.5`.
   - Background: subtle warm gradient like share card (`bg-gradient-to-br from-secondary/40 to-card`), padded `px-5 pt-5 pb-6`.

2. **Restyle the pair grid** (lines 98–112) to look like share card's `ProductCard`:
   - Switch from `grid grid-cols-2 divide-x` to `grid grid-cols-2 gap-3 px-3 pb-4` (no divider; two distinct cards with rounded corners + soft shadow).
   - Update `ProductSide` so the highlighted side gets `border-2 border-foreground` (dark accent, like share card) instead of green ring. Keep success-green text for the "YOU SCANNED" eyebrow only when steal — reinforces the win without the loud pill.
   - Card body: white bg, `rounded-2xl`, `shadow-sm`, internal padding, image in a square `bg-secondary/40` tile. Match share card proportions.

3. **Lookalike band**: keep but remove the risk chip from it (now lives in the header mini-row). Band stays as a thin info strip just for the lookalike + visual-similarity %. If only risk was driving its display and there's no `dupeType`/`packagingSimilarity`, hide the band entirely.

4. **No green "You found a steal" pill anywhere** — that copy lives only as the eyebrow text now.

## Why this works

- "You found a steal" is the loudest thing on the screen by far (huge display number + eyebrow), so prominence is solved by hierarchy, not color volume.
- Mirrors the share asset, so what users see in-app is what they post — consistent brand moment.
- Removes the visually-competing risk chip from the band by promoting it to the header.

## Files

- `src/components/dupe-card.tsx` — only file changed. No data, no backend, no share card edits.
