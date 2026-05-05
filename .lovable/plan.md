## Goal

Replace the current post-auth onboarding (gender → age → frequency → categories → goal → pain → social_proof → trust → building → plan_reveal → notifications → sample_loading → sample_result) with a tighter, more immersive 9-step value-building flow that visually previews the actual Dupli product before paywall.

Out of scope (not touched): `/onboarding/email`, `/onboarding/password`, auth, subscription, paywall, checkout, scan flow, app screens, pricing, routing.

## New post-auth onboarding sequence

1. **Problem** — "Stop overpaying for beauty products" + immersive expensive-vs-cheap visual. CTA Continue.
2. **Category personalization** — "What do you want Dupli to help you save on?" (Skincare / Makeup / Haircare / Body / Everything). Tap-to-advance.
3. **Pain point** — "What usually makes beauty shopping frustrating?" (5 options listed in spec). Tap-to-advance.
4. **Product preview: Scan** — "Scan before you buy" + immersive in-store scan composition. CTA "Show me more".
5. **Product preview: Results** — "See results that actually help" + results-screen mockup composition. CTA Continue.
6. **Product preview: Comparison/Other dupes** — "Compare smarter alternatives" + comparison composition. CTA "That's useful".
7. **Commitment / value** — "What would make Dupli worth it for you?" (5 options from spec). Tap-to-advance.
8. **Building** — animated checklist loader with rotating lines from spec.
9. **Plan reveal** — "Your Dupli plan is ready" + hero composition + 4 value bullets. CTA Continue → marks onboarding complete server-side and routes to `/paywall`.

Removed: `gender`, `age`, `frequency`, `goal` (collapsed into commitment), `social_proof`, `trust`, `notifications`, `sample_loading`, `sample_result` (the live-scan handoff and sample result screens go away — paywall now shows the real value of unlocking).

## Visual generation (Nano Banana)

Generate 6 new images using `google/gemini-3.1-flash-image-preview` via the AI gateway script. Each image uses the existing saved screenshots (`src/assets/onboarding/hero-camera-scan.jpg`, `src/assets/onboarding/hero-result-phone.jpg`, `src/assets/trust-ingredient-comparison.png`, `src/assets/dupli-app-icon-1024.png`) as visual reference / source material to keep the look on-brand.

| File | Used on screen | Prompt direction |
|---|---|---|
| `src/assets/onboarding/problem-overpaying.jpg` | 1. Problem | Editorial flat-lay: a luxury serum next to a near-identical cheaper bottle, soft cream/pink gradient, price tags ($72 vs $14), subtle Dupli mark |
| `src/assets/onboarding/category-grid.jpg` | 2. Category (header art) | Curated grid of beauty product categories — skincare, makeup, hair, body — premium editorial styling |
| `src/assets/onboarding/pain-regret.jpg` | 3. Pain | Hand holding a viral product in store with a phone showing a Dupli-style "cheaper match found" overlay |
| `src/assets/onboarding/preview-scan.jpg` | 4. Scan preview | iPhone camera POV scanning a serum on a store shelf; reticle + "Recognizing…" UI; based on hero-camera-scan |
| `src/assets/onboarding/preview-results.jpg` | 5. Results preview | Phone mockup showing the actual results screen with strong-match badge + 17% savings; based on hero-result-phone |
| `src/assets/onboarding/preview-compare.jpg` | 6. Comparison preview | Side-by-side product cards (premium vs dupe) with similarity %, prices, ingredient overlap chips |
| `src/assets/onboarding/plan-ready.jpg` | 9. Plan reveal | Hero composition: phone showing personalized Dupli home with savings stat, surrounded by floating product cards |

Generation happens via the ai-gateway skill script (`/tmp/lovable_ai.py … --image --model google/gemini-3.1-flash-image-preview`). Files written to `src/assets/onboarding/`.

## Code changes

**`src/routes/onboarding.index.tsx`** — restructure the `Step` union, `ORDER`, and the screen blocks to match the 9-step sequence. Reuse `OnboardingShell`, `GuidedLineReveal`, `TapCard`, `ChecklistLoading`, `PlanReveal`. Each preview screen wraps its hero image in a rounded device-style frame with a soft gradient fade and one supporting `LearningCard` for context. Tap-to-advance for question screens; CTA-to-advance for preview screens. Final CTA on plan reveal calls `markOnboardingComplete()` + `saveOnboardingAnswers` + `completeOnboarding` then `navigate({ to: "/paywall" })` — same server contract as today.

**Onboarding state** — keep using existing `OnboardingState` shape. Map new answers:
- categories → existing `categories` field (single-select "Everything" stored as all 6 categories)
- pain → stored under existing `goal` field (closest semantic) OR added to `onboarding_answers` blob via `saveOnboardingAnswers`
- commitment → stored in `onboarding_answers` blob

No DB schema change. `onboarding_completed` only flipped at the very end (unchanged behavior).

**Removed UI** — the `cameraOpen` / `scanning` / `results` branches inside this route (lines 189–234) are removed because the real-scan handoff is no longer part of onboarding. `useScanFlow` import drops. `SampleResultScreen`, `ReceiptCard`, `MiniProduct`, `FileInputs`, `freqLabel`, and unused icons are deleted.

**No changes** to: `onboarding.email.tsx`, `onboarding.password.tsx`, `_app.tsx`, `paywall.tsx`, `use-scan-flow.ts`, `scan-fab.tsx`, server middleware, scan functions, billing.

## Acceptance check

- Email/password screens untouched (verified by not editing those files).
- Flow has exactly 9 post-auth screens, each with a strong product-led visual.
- Three explicit preview screens (scan, results, comparison) showing the app in action.
- `onboarding_completed` is set only on the final "Your plan is ready" CTA, which routes to `/paywall`.
- No changes to auth, subscription, scan, or pricing logic.
