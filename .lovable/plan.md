# Onboarding v2 — Cal AI conversion pattern

## What's wrong with v1

- Too many "lesson" screens stacked back-to-back (`pain` + `trust_gap` + `match_quality`) — reads like a brochure, not an app.
- Reveal animation is slow (380ms stagger × multiple lines + cards) — first tap takes 3–5s. Cal AI feels *instant*.
- No commitment beats: no rating prompt, no notifications ask, no testimonials, no "we made you a plan" personalization payoff.
- Sample result is buried behind a choice screen instead of being the climax.
- Paywall appears flat — no anchor price, no "trial timeline," no urgency.

## New flow (14 fast screens, ~60s)

```
1.  Welcome              big logo + 1 line + Get Started
2.  Gender               Female / Male / Other          (1 tap)
3.  Age range            18-24 / 25-34 / 35-44 / 45+    (1 tap)
4.  "How often do you buy beauty?"                      (existing freq)
5.  "What do you shop for?"     multi-select chips      (existing cats)
6.  "What matters most?"   Save money / Clean ingredients / Find viral dupes / All
7.  Pain reveal         receipt + "$1,400/yr avg" stat  (1 line, fast)
8.  Social proof        4.8★ + 3 testimonial cards      auto-scroll
9.  Trust explainer     ONE screen: looks-similar vs ingredients (collapsed)
10. "Building your scanner…"  animated checklist tied to user's answers
11. Personalized plan reveal   "Based on you: ~$340/yr in potential savings"
12. Notifications ask    "Get notified when we find a match"   Allow / Not now
13. Sample scan          auto-runs, shows Strong Match result
14. Paywall              annual trial w/ timeline graphic, $0.99 fallback
```

After 14: real scan flow OR `/app`.

## Key design changes

**Speed**: drop reveal stagger from 380ms → 120ms; headline + body appear together; only secondary cards stagger. Tap-to-skip animation.

**One question per screen** (screens 2–6): giant tappable cards, no Continue button — auto-advance on tap (Cal AI signature). Back chevron only.

**Personalization payoff** (screen 11): use their answers to compute a fake-but-plausible "$X/yr potential savings" number. This is the dopamine hit before paywall.

**Loading screen with checklist** (screen 10): items reference *their* selected categories ("Indexing skincare matches…", "Tuning for weekly shoppers…"). 2.5s total, items check off in sequence. This is Cal AI's most-copied beat.

**Social proof screen** (screen 8): 4.8★ rating row + 3 short testimonial cards in a horizontal auto-scroll. No Continue gating.

**Paywall redesign**:
- Header: "Start your 7-day free trial"
- 3-step timeline: Today (unlock all) → Day 5 (reminder) → Day 7 (charged $39.99)
- Toggle: Yearly $39.99 (save 67%) / Monthly $9.99
- Big CTA: "Start My Free Trial"
- Small text: "No payment due now" (if Apple) or current copy
- "$0.99 first month" as ghost link below

## Files

- **`src/routes/onboarding.tsx`** — full rewrite of step machine. New steps: `welcome`, `gender`, `age`, `frequency`, `categories`, `goal`, `pain`, `social_proof`, `trust`, `building`, `plan_reveal`, `notifications`, `sample_loading`, `sample_result`. Drop separate `trust_gap` and `match_quality`; merge into one trust screen.
- **`src/lib/onboarding.ts`** — extend `OnboardingState` with `gender`, `ageRange`, `goal`. Add `estimatedYearlySavings(state): number` helper used by plan reveal.
- **`src/components/onboarding/onboarding-shell.tsx`** — add `hideProgress` prop for welcome/social-proof; tighten transitions.
- **`src/components/onboarding/guided-line-reveal.tsx`** — reduce default `stagger` to 120, `delay` to 40; add `instant` prop for speed-critical screens.
- **`src/components/onboarding/tap-card.tsx`** *(new)* — large tappable answer card used by gender/age/goal screens; auto-advances on tap with a subtle scale+check animation.
- **`src/components/onboarding/social-proof.tsx`** *(new)* — rating header + horizontal testimonial scroller.
- **`src/components/onboarding/plan-reveal.tsx`** *(new)* — animated savings counter (counts up to estimated $/yr), category badges, "Your plan is ready" headline.
- **`src/components/onboarding/trial-timeline.tsx`** *(new)* — 3-dot vertical timeline used in paywall.
- **`src/routes/paywall.tsx`** — restructure: plan toggle, timeline, single primary CTA, $0.99 as text link.

## Behavior rules preserved

- Failed scans don't trigger paywall (sample loading is fake-success only; real scan failure stays in scan flow).
- Onboarding completion still persists via `markOnboardingComplete()`.
- Real scan path still routes through `useScanFlow` and existing `ScanningScreen` / `ResultsScreen`.
- Language stays "Strong/Good/Possible Match" — no "exact dupe."
- Paywall only after value (sample result OR first real result OR explicit premium tap).

## Out of scope

- No backend / DB changes (all state stays in localStorage).
- No real Apple/Google IAP wiring — paywall buttons still call `markOnboardingComplete()` + navigate.
- Testimonials are static copy for now; can swap to real ones later.
