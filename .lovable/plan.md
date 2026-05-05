# Fix: Signup skips the quiz and jumps straight to paywall

## Root cause

In `onboarding.password.tsx`, after a successful `signUp` we `navigate({ to: "/" })`. The root splash sees a signed-in user and pushes them to `/app`, which then bounces to `/paywall` because there's no subscription. The personalization quiz (gender → goal → plan reveal → sample result) lives at `/onboarding` and is never visited.

The `/onboarding` route already has a `beforeLoad` that redirects signed-in users to `/`, so even visiting it directly bounces away.

## Fix

Make the quiz reachable for freshly-signed-up users via an explicit search param, and route the signup success straight into it.

1. **`src/routes/onboarding.password.tsx`** — On successful `signUp`, navigate to `/onboarding?start=quiz` instead of `/`. On successful login (returning user), keep `navigate({ to: "/" })` so they go straight to /app or /paywall.

2. **`src/routes/onboarding.index.tsx`**
   - Add `validateSearch` for `{ start?: "quiz" }`.
   - Update `beforeLoad`: if signed-in AND `search.start !== "quiz"` AND profile already has `onboarding_completed=true` → redirect to `/`. Otherwise allow the route to render. (Simpler version: if `search.start === "quiz"`, skip the redirect entirely; else keep current behavior.)
   - In `OnboardingPage`, read `Route.useSearch()`. If `start === "quiz"`, initialize `step` to `"gender"` instead of `"welcome"`.
   - At the end of the quiz (sample_result `onScanOwn` / `onSeeFull`), call `completeOnboarding()` server fn (and `markOnboardingComplete()` locally) before navigating to `/paywall`. Also call `saveOnboardingAnswers()` with the collected gender/age/frequency/categories/goal.

3. **`src/routes/_app.tsx`** — Before paywall redirect, also check `onboardingCompleted`. If a signed-in user lands on `/app` without completing onboarding (e.g. page refresh mid-quiz), send them to `/onboarding?start=quiz` instead of `/paywall`. Use the new `getRouteResolution` server fn.

## Files

- `src/routes/onboarding.password.tsx` — change post-signup nav target
- `src/routes/onboarding.index.tsx` — accept `?start=quiz`, persist completion, save answers
- `src/routes/_app.tsx` — gate on `onboarding_completed` before paywall

## Out of scope

No changes to paywall, checkout, Paddle, or quiz content/copy.
