## Goal

Instead of asking the AI for one dupe, ask for 5–7 candidates. The AI ranks them, the top one becomes the main dupe (current UI unchanged), and the others appear under the result in a horizontal scroll labeled something like "Also could be a dupe."

## Cost / time impact (honest answer)

**Latency:** Roughly **1.3×–1.8×** the current scan time. We're using the same single AI call (still one round trip), but the model has to think about more candidates and write more output. Today we cap output at 2,400 tokens; 5–7 candidates pushes that to ~4,500–5,500 tokens. On `gemini-2.5-flash` that's typically an extra **2–5 seconds**. No new network hops on the AI side.

**The real latency cost is product images.** Today we look up 2 images in parallel (original + dupe). With 7 candidates that's 8 lookups. Each `findProductImage` call hits DuckDuckGo/Bing and takes ~500–1500ms. Done in parallel, the whole batch still finishes in roughly the slowest single lookup (~1–2s), so this is mostly free — but it does increase the chance one or two images come back empty.

**Cost:** Per-scan AI cost goes up roughly **2×** (more output tokens). Still cents per scan on Flash.

**Complexity:** Low–medium. It's mostly a schema change + a new UI strip. No DB migration, no new server function, no new dependencies.

## What changes

### 1. AI schema + prompt (`src/server/scan.functions.ts`)

- Replace the single `dupe` field with a `dupes` array of 5–7 candidates (same shape as today's `DupeSuggestion`, plus a per-candidate `matchScore`, `dupeType`, `packagingSimilarity`, `riskLevel`, `riskFactors`, `missingActives`, `safetyNote`, `sharedIngredients`, `uniqueToOriginal`, `uniqueToDupe`, `contextMatch`, short `notes`).
- Ask the model to return them **sorted best → worst** and to set the top-level `verdict` based on candidate #1.
- Keep top-level fields (`matchScore`, `verdict`, `notes`, `bestFor`, etc.) as a mirror of the #1 candidate so existing screens (results, share card, history) keep working with zero changes.
- Add a derived `dupe` getter on the server side = `dupes[0] ?? null` so the rest of the app stays backward-compatible.
- Bump `max_tokens` to ~5500. Keep `temperature: 0.2`.

### 2. Image enrichment

- Parallel-fetch images for the original + all candidates with `Promise.all`. Wrap each in the existing `safeFind` so a missing image never breaks the response. Cap at 7 lookups so worst case is bounded.

### 3. Database + types

- The `scans` table already stores the full analysis JSON, so no migration needed — the `dupes` array just rides along inside the existing JSON column.
- Update the `DupeAnalysis` TypeScript type to add `dupes: DupeSuggestion[]` (each candidate also carrying its own match/risk fields).
- Old saved scans (single `dupe`) keep rendering: when loading, if `dupes` is missing but `dupe` exists, treat it as a 1-item array.

### 4. UI — main result screen (`src/components/scanner.tsx` results view + `src/components/dupe-card.tsx`)

- Top of the screen: unchanged. The hero dupe card still shows candidate #1 exactly like today.
- Below the existing comparison block, add a new section:
  - Small uppercase eyebrow: **"Also could be a dupe"**
  - Horizontal scroll rail (snap-x, edge padding, hides scrollbar) of compact cards for candidates #2–#7.
  - Each card: product image, brand, product name, price, small match-score chip, tap → opens that candidate in a sheet/modal showing the full comparison (reusing the existing dupe-card layout against the same original).
- Empty/edge case: if AI only returns 1 dupe, hide the rail entirely.

### 5. Share card

- Unchanged — keeps featuring the #1 dupe only. (Sharing 7 dupes on one card hurts the design.)

## Technical notes

- Single AI call, single `tool_choice`, no streaming changes.
- Tool schema `dupes` array: `minItems: 1, maxItems: 7`, with the 1st item required.
- The model is told: "Return 5–7 plausible candidates sorted by overall fit. The first must be your strongest pick — you'll be evaluated on it. Diversity matters: don't return 7 near-duplicate listings of the same product."
- Backward-compat shim in `normalizeAnalysis`: if `dupes` is empty but legacy `dupe` exists, wrap it; if `dupes` exists, set `dupe = dupes[0]` so all current screens keep working without edits.

## Out of scope

- No swiping to "promote" a different candidate to main (can be a follow-up).
- No saving individual candidates to history separately — the whole scan stays one row.
- No changes to the SkinSort DB lookup (still disabled per your earlier call).

## Recommendation

Worth doing. The latency hit is small (a couple seconds), the cost is still cents, and the UX win — "here's the best dupe, plus 6 more options to consider" — is exactly the kind of thing that makes the app feel smart instead of guessy.
