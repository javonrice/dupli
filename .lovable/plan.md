## Trending dupe card — side-by-side comparison

Rewrite `src/components/home/community-dupe-card.tsx` so original and dupe sit at equal weight, with the match% and savings dividing them. No hero, no footer reference — pure compare.

### Layout

```text
┌─────────────────────────────┐
│  [STEAL · 38% off]          │  optional badge, top-right
│ ┌──────────┐  ┌──────────┐  │
│ │ original │  │   dupe   │  │  two equal squares, side by side
│ │  image   │vs│  image   │  │  thin "vs" pill straddles the gap
│ └──────────┘  └──────────┘  │
│ DRUNK ELEPHANT   THE ORDINARY│  brand row (uppercase, 2 cols)
│ Protini Polypep…  Buffet     │  name row (display, 2-line clamp)
│ $68              $14         │  price row (tabular, equal cols)
├─────────────────────────────┤
│       ◆ 92% match           │  full-width divider, accent color
└─────────────────────────────┘
```

- Two equal-width columns inside each row so the eye reads top-to-bottom AND left-to-right unambiguously: the left column is always the original, the right is always the dupe. A faint vertical divider line runs through the card to reinforce the split.
- Small `vs` pill centered on the image divider line.
- Dupe price gets `font-bold`; original price gets `text-muted-foreground` (not strike-through — both are real prices, the dupe is just the highlighted side).
- Steal badge (existing `detectSteal` 25% buffer rule) sits top-right of the dupe column instead of overlaying the original.
- Match% pill becomes the bottom band of the card (full width, secondary background) — same place hierarchy as before, just relocated.

### Variant widths

- `variant="card"` (rail, 200px): images shrink to ~84×84 each, name clamps to 2 lines, price 13px. Tight but legible.
- `variant="tile"` (grid, full width): images 120×120+, name 14px, price 16px.

Same component handles both via the existing `widthClass` switch; only the inner image/text sizes scale with a `compact` boolean derived from `variant === "card"`.

### Other touches

- Keep `dupeLinkProps` routing (`saved:` → scan view, else product page) untouched.
- Keep `detectSteal` and `fmtPrice` as-is.
- Drop the "dupe for" footer entirely.
- No schema or server changes. Pure component rewrite.

### File touched

- `src/components/home/community-dupe-card.tsx` — rewrite layout; props/exports unchanged so `community-feeds.tsx` and `p.$productId.tsx` keep working without edits.
