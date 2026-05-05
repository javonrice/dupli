# Mobile polish + remove paywall close button

The onboarding and paywall structure is solid (safe-area utilities, sticky CTA, device-frame container queries are all already wired up). I'm not going to refactor things that work. The targeted issues actually worth fixing on a phone viewport (390x843) are below.

## 1. Paywall — remove the X close button

In `src/routes/paywall.tsx`:
- Delete the entire `<div className="flex items-center justify-end ...">` block containing the `<X />` button (lines 176–185).
- Replace it with a small `<div className="h-3" />` spacer so the headline doesn't slam into the safe-area inset.
- Remove now-unused imports (`X` from lucide-react) and the unused `handleClose` function.

Effect: no escape hatch from the paywall — user must choose Start Trial. Back-gesture/browser back still works (we don't trap navigation), which is the right amount of friction.

## 2. Onboarding — small mobile fit fixes

These are the real issues at 390x843, not a redesign.

**a. `src/routes/onboarding.index.tsx` — welcome screen**
The hero image uses `h-[58vh] min-h-[360px]`. On a 390x843 phone with the sticky CTA + wordmark + headline + subhead + stars + safe-areas, 58vh (~489px) leaves only ~140px for everything below — the rating row gets pushed close to the CTA. Change to `h-[52vh] min-h-[320px]` and tighten the text block: `pt-2` → `pt-3`, `mt-4` (h1) stays, `mt-2` (p) stays, `mt-4` (stars) → `mt-5`. Result: comfortable breathing room, no clipping on small phones (375x667 iPhone SE).

**b. `src/routes/onboarding.index.tsx` — `pain` and `category` steps**
On `pain`, the screen has: headline + image (`ProductHero`) + 5 `TapCard`s. Each TapCard is ~72px tall (py-4 + 40px icon + text), so 5 cards ≈ 360px, plus 200px image, plus headline, plus shell chrome — overflows 843px. The container already has `overflow-y-auto` so it scrolls, but the scroll isn't obvious because there's no CTA pinning the bottom (auto-advance on tap). Fix: shrink the image on these list-heavy steps. In `ProductHero`, the image uses natural aspect — wrap it with `max-h-[28vh] object-cover` when used inside list-heavy steps. Cleanest: pass an optional `compact` prop to `ProductHero` that adds `max-h-[26vh]` and `object-cover` to the `<img>`. Apply `compact` only on `pain` (the `category` step has no image).

**c. `src/components/onboarding/onboarding-shell.tsx` — sticky CTA gradient**
The sticky bottom container uses `bg-gradient-to-t from-background via-background to-background/0` but the `via-background` makes the gradient solid for ~⅔ of its height — the fade is barely visible. Change to `from-background via-background/95 to-background/0`. Minor visual fix, helps content-behind-CTA feel native.

**d. `src/components/onboarding/onboarding-shell.tsx` — bottom padding**
`pb-3` inside `space-y-2 pb-3` plus `pb-safe` on outer plus `pt-3` gives ~24px+ of dead space below the CTA on phones with no home-indicator. Reduce inner `pb-3` → `pb-2`. Tiny but noticeable.

**e. `src/routes/onboarding.index.tsx` — `plan_ready` step**
Has: success chip + headline + 1 line of body + `ProductHero` image + 4-item checklist + sticky CTA. This overflows on every phone. Two fixes:
- Drop the `ProductHero` on this step (the checklist already communicates the payoff visually). Or keep it `compact`. Recommend: keep image, mark `compact`, and tighten checklist `space-y-2` → `space-y-1.5`, `py-3` → `py-2.5`.

**f. `src/routes/onboarding.index.tsx` — checklist "building" screen**
`pt-8` on the wrapper plus centered layout means on short phones the headline can sit close to the back-arrow row. Change `pt-8` → `pt-4` and rely on `justify-center` for vertical balance.

## 3. What I'm explicitly NOT changing

- The device-frame wrapper / `h-screen-safe` system — already correct.
- Safe-area utilities — correct.
- Tap targets — all already ≥44px.
- Typography scale — already mobile-tuned (28px display headlines, 14–15px body).
- Color tokens — semantic, no hardcoded colors to fix.
- Email/password/login routes — these were not flagged and are simple forms; touching them risks regressions.

## Files changed

- `src/routes/paywall.tsx` — remove X button + handleClose + X import
- `src/routes/onboarding.index.tsx` — welcome hero height, `compact` prop on `ProductHero` for `pain`/`plan_ready`, building screen padding, plan_ready checklist density
- `src/components/onboarding/onboarding-shell.tsx` — gradient stop + bottom padding

No new dependencies. No DB or backend changes. No design-token changes.
