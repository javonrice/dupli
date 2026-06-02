## Final plan

Cal AI–style immersive onboarding → personalized reveal → hard paywall (3-day free trial) → auth → app. Mobile-first, fully edge-to-edge.

## Flow (13 screens)

```text
1.  Welcome           — cinematic brand promise, "Stop overpaying"
2.  Goals             — multi-select: save money / find luxury for less / shop smarter / stop impulse buys
3.  Age band          — 18-24 / 25-29 / 30-34 / 35+ (used to tailor stat on screen 8)
4.  Monthly spend     — slider $0–$500+ on beauty/fashion
5.  Pain point        — single-select empathy screen
6.  Social proof      — "94% save $200+/month" + 3 testimonials
7.  Categories        — chips: Skincare, Makeup, Fragrance, Fashion, Home, Tech
8.  Brand affinity    — logo grid (Sephora, Drunk Elephant, Charlotte Tilbury, Dyson…)
9.  Psychological hit — "You're on track to waste $X,XXX this year" (personalized from spend × 12)
10. Commitment        — "Ready to stop overpaying?" → big YES (foot-in-the-door)
11. Analyzing loader  — 5s fake compute, rotating labels echoing their answers
12. Reveal            — "Your Dupe Style: {profile}" + "$X,XXX/yr projected savings" + locked plan cards
13. Paywall           — 3-day free trial annual (pre-selected), monthly, lifetime; delayed dim X at 5s
   ↳ Downsell (on X)  — "Wait — here's 50% off your first year" → discounted annual or continue free/limited
   ↳ Stripe checkout  — email collected here
14. Auth return       — set password / Google → enter app
```

## Paywall (research defaults — Superwall / RevenueCat)

- 3 tiers: **Annual + 3-day free trial** (default, "Most Popular", "Save 67%"), Monthly, Lifetime (anchor).
- Trust row: ⭐ 4.8, "10,000+ savers", money-back guarantee.
- Testimonial carousel (auto-rotate, 3 quotes with name + age).
- Soft urgency: "Your personalized plan is reserved for 10:00" countdown.
- Sticky gradient CTA with subtle pulse.
- **Escape X**: invisible for 5s, then fades to ~15% opacity top-right, tiny, no chrome. Tap → downsell screen (one-time 50% off annual). Decline downsell → app in limited free mode (3 scans).

## Psychological tactics in use

Loss aversion (waste framing) · personalization illusion (answers echoed in reveal) · commitment & consistency (micro-yes) · social proof (twice) · effort justification (5s analyze) · anchoring (lifetime tier makes annual feel cheap) · soft scarcity (reservation countdown) · curiosity gap (blurred plan on reveal) · identity framing (Dupe Style label).

## Architecture

**Routes** (new pathless `_onboarding` layout, no app chrome):
- `_onboarding.tsx` — full-screen layout, progress bar, fade/scale transitions, back gesture.
- `_onboarding/welcome.tsx`, `goals.tsx`, `age.tsx`, `spending.tsx`, `pain.tsx`, `social.tsx`, `categories.tsx`, `brands.tsx`, `psych.tsx`, `commit.tsx`, `analyzing.tsx`, `reveal.tsx`, `paywall.tsx`, `downsell.tsx`, `complete.tsx` (auth return landing).

**State**: Zustand store `useOnboardingStore`, persisted to localStorage so refresh resumes mid-flow. No DB writes until auth.

**Auth ordering** (research-aligned: value before signup):
- Onboarding answers live in localStorage through screen 13.
- Stripe checkout collects email → on return (`/onboarding/complete?session_id=...`), if no Supabase user with that email, prompt password/Google sign-up; if existing, sign in.
- After auth: write `profiles.onboarding_answers` (jsonb) + `profiles.onboarding_completed = true`. Stripe webhook (already wired) links the subscription to the user.

**Routing gates**:
- `/` (index) for unauthenticated → redirect to `/welcome` (the onboarding entry).
- `_authenticated` layout already gates the app. Add a second check: if `profiles.onboarding_completed = false` AND no active subscription → redirect to `/welcome` to resume. Existing users get a one-time SQL backfill `onboarding_completed = true`.
- `/app/*` requires `has_active_subscription()` OR limited free mode flag (cap = 3 scans).

## Database

Profiles already has `onboarding_completed` + `onboarding_answers` jsonb — no schema changes needed for storing answers.

One small migration:
- Add `profiles.dupe_style text` and `profiles.projected_annual_savings int` (used to personalize app post-onboarding, e.g. dashboard greeting "You're on track to save $X this year").
- Add `profiles.free_scans_used int default 0` for the downsell-decliners' limited free mode.
- Data backfill (insert tool, not migration): set existing users' `onboarding_completed = true` so we don't lock them out.

## Payments

Stripe is already wired (subscriptions table uses `stripe_*` columns, `has_active_subscription` exists). I'll need to verify three products/prices exist (annual w/ 3-day trial, monthly, lifetime). If they don't, I'll either create them via the Stripe tool or flag for you. The downsell coupon (50% off first year) needs a Stripe coupon — I'll create it.

## Design

Fully immersive, per-screen soft gradient backgrounds, large display type, one primary action per screen, haptic-feel motion (Framer Motion scale + fade), thumb-reachable CTAs. All colors via existing tokens — no hardcoded hex in components.

## Build order

1. Migration: add 3 profile columns + backfill existing users `onboarding_completed = true`.
2. Onboarding store + layout + progress bar + transitions.
3. Screens 1–10 (quiz) with shared screen components.
4. Analyzing + reveal screens with personalization logic (savings calc + style profile derivation).
5. Paywall + downsell + Stripe checkout integration + delayed-X behavior.
6. Auth-return screen, write onboarding answers to profile, route into app.
7. Gating updates in `_authenticated` + index redirect.
8. QA the full flow at 428×649 viewport.

Ready to switch to build and ship this.