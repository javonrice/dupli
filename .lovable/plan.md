## What's changing

Right now the scanner is built around one idea: "find a cheaper version of this product." Your TikTok screenshots show that real-world dupe culture is actually about two different things:

1. **Lookalike packaging** — the Dollar Tree bottle is *designed to look like* La Roche‑Posay, eos, Vaseline, Summer Fridays. The visual mimicry IS the dupe.
2. **Risk vs. reward** — a cheaper lookalike isn't automatically a win. It might be missing the active that made the original work, OR it might add irritants (fragrance, alcohol, harsh acids without buffering) that the original carefully avoided.

So we'll teach the scanner to think like someone walking the Dollar Tree aisle, not like a savings calculator.

## New analysis dimensions

Every scan will produce these new fields (in addition to what's already there):

- **dupeType**: `"Lookalike packaging"` | `"Formula dupe"` | `"Both"` | `"Neither"` — explains *why* it qualifies as a dupe
- **packagingSimilarity**: 0–100 — how much the dupe's packaging mimics the original (color, shape, font, layout)
- **riskLevel**: `"Lower risk"` | `"Comparable"` | `"Higher risk"` — whether switching to the dupe is safer, the same, or riskier than the original
- **riskFactors**: short list of specific concerns in the dupe (e.g. "Added fragrance", "Higher % glycolic acid without buffering", "Denatured alcohol high in INCI list", "No SPF despite mimicking sunscreen packaging")
- **missingActives**: actives the original has that the dupe doesn't (e.g. "Niacinamide", "Ceramides") — what you give up
- **safetyNote**: one plain-English sentence an esthetician would say out loud ("Fine for body, I wouldn't put this on a compromised face barrier.")

The verdict enum gets one more option: **`"Risky dupe"`** — cheap and lookalike, but the formula tradeoff is bad enough we shouldn't recommend it.

## Prompt rewrite

The system prompt for Gemini gets reframed:

- Stop optimizing for "cheapest match." Start asking "is this a credible swap, and what does the user lose or risk by swapping?"
- Treat **visual packaging mimicry** as a first-class signal. If the user photographed an XtraCare body balm in a navy tube with white wave that obviously copies Vaseline, the dupe IS Vaseline — even if the price gap is small.
- For Dollar Tree / drugstore lookalikes specifically, score packaging similarity honestly (color palette, bottle shape, typography, label layout).
- Score risk separately from match. A 90% formula match can still be "Higher risk" if the dupe swaps a buffered acid for an unbuffered one.
- Never inflate the verdict. "Skip" and the new "Risky dupe" exist for a reason.

## UI changes (results screen + share card)

**DupeCard gets a new top section** above the verdict bar:

```text
┌──────────────────────────────────────────┐
│  LOOKALIKE PACKAGING  ·  92% visual      │
│  ⚠ Higher risk than the original         │
└──────────────────────────────────────────┘
```

**Below the formula breakdown**, a new "Risk check" panel:

- Shaded amber when `Higher risk`, neutral when `Comparable`, soft green when `Lower risk`
- Lists `riskFactors` as chips with a small warning icon
- Lists `missingActives` under "What you give up"
- Closes with the `safetyNote` in italic, attributed to the esthetician voice

**ShareCard** gets a small "Risk: Higher / Comparable / Lower" pill next to the verdict pill, so when someone shares the card on TikTok the warning travels with it.

**ScanListItem** (history + saved): if `riskLevel === "Higher risk"`, show a tiny amber dot next to the match score so risky dupes are visible at a glance in the list.

## Backend / data

- No DB migration. The `scans.analysis` column is already `jsonb`, so new fields land there automatically. Older scans without the new fields render gracefully (fields are optional in the type and the UI uses conditional rendering).
- Update the `DupeAnalysis` TypeScript type and the `analyze_dupe` tool JSON schema in `src/server/scan.functions.ts` to include the new fields as required outputs.
- `saveScan` keeps writing the full analysis blob; no changes needed there.
- The new verdict `"Risky dupe"` gets its own style entry in `verdictStyles` (amber background, warning icon).

## Files I'll touch

- `src/server/scan.functions.ts` — extend `DupeAnalysis` type, expand the system prompt, add the new fields to the tool schema
- `src/components/dupe-card.tsx` — add the lookalike/risk header band, risk-check panel, "Risky dupe" verdict style
- `src/components/share-card.tsx` — add risk pill next to verdict pill
- `src/components/scan-list-item.tsx` — amber risk dot when `riskLevel === "Higher risk"`

## What I won't do (yet)

- I won't add a separate "Compare to a brand I name" flow — the camera still drives everything.
- I won't change history/saved schemas. The richer data lives inside the existing `analysis` jsonb.
- I won't add an ingredient-by-ingredient hazard database. The risk read comes from the AI's reasoning over the formula it identified, not a static lookup.

After you approve, I'll implement and you can scan one of the Dollar Tree screenshots to see the new risk-aware verdict in action.