## Root cause

The "Get Started" button still calls `navigate({ to: "/onboarding/email" })`, but two `beforeLoad` guards turn that navigation into an immediate loop back to `/onboarding`:

1. **`src/routes/onboarding.index.tsx` welcome `beforeLoad`** — when *any* session exists, it calls `getRouteResolution()` and on success unconditionally `throw redirect({ to: "/" })`, ignoring the actual resolved destination.
2. **`src/routes/onboarding.email.tsx` `beforeLoad`** — `if (data.session) throw redirect({ to: "/" })`. Any session sends the user to `/`.
3. **`src/routes/index.tsx`** — for a sessioned user it calls the resolver and navigates wherever it points, often back to `/onboarding`. Loop closes: `/onboarding → /onboarding/email → / → /onboarding`. The click appears to do nothing.

For a fully clean anonymous user the click does work, but in production most users hitting this page have *some* supabase token (mid-onboarding signup, prior partial session, OAuth flicker), so the loop fires.

`resetToOnboarding` and `clearStaleClientState` themselves are not the trigger. The bug is the two beforeLoads doing blanket `redirect({ to: "/" })` instead of routing by canonical destination.

## Fix

Keep the stale/deleted-user protections, but make the welcome and email guards loop-safe and destination-aware.

### 1. `src/routes/onboarding.index.tsx` — welcome `beforeLoad`

For a sessioned user on the welcome path (no `?start=quiz`):
- Call `getRouteResolution()`.
- Branch on `res.destination`:
  - `/app` or `/paywall` → `throw redirect({ to: dest.to })`.
  - `/onboarding` with `search.start === "quiz"` → `throw redirect({ to: "/onboarding", search: { start: "quiz" } })`. URL actually changes, so the next `beforeLoad` invocation hits the existing `start=quiz` branch (which already short-circuits when `onboardingCompleted` is false). No same-URL loop.
  - `/onboarding` without `start=quiz` → return (render splash). Should be rare; means resolver agrees the user belongs on the welcome page.
- `isAuthError` → signOut + `clearStaleClientState` + return (render splash). (Current behavior, keep.)
- Transient error → return (render splash). (Current behavior, keep.)

Anonymous users (no session): unchanged — render splash. No `resetToOnboarding` call.

### 2. `src/routes/onboarding.email.tsx` — `beforeLoad`

Replace `if (data.session) throw redirect({ to: "/" })` with destination-aware logic:
- No session → return (render). This is the common path; never call `resetToOnboarding`.
- Session present → call `getRouteResolution()`:
  - dest `/app` or `/paywall` → `throw redirect({ to: dest.to })`.
  - dest `/onboarding` with `start=quiz` → `throw redirect({ to: "/onboarding", search: { start: "quiz" } })`.
  - dest `/onboarding` (welcome) → return (render the email screen; user explicitly navigated here from the splash, do not bounce).
  - Resolver throws `isAuthError` → signOut + `clearStaleClientState` + return (render email; now effectively anonymous).
  - Transient error → return (render; don't trap).

Both guards must wrap the resolver call in try/catch and re-throw `isRedirect(e)` errors so intentional redirects aren't swallowed.

### 3. `src/lib/auth-reset.ts` — anonymous no-op guard

In `resetToOnboarding`, before calling `signOut()` and `clearStaleClientState()`, check `await supabase.auth.getSession()`. If there is no session, skip both side-effects and just navigate to `/onboarding`. Prevents an accidental call from a clean anonymous visitor from clearing storage or doing a full reload.

`clearStaleClientState` does NOT touch `dupli.onboarding.v1` (verified — not in `STALE_LOCAL_KEYS` or any prefix). No change needed there.

### 4. Temporary diagnostic logs

Gated by `import.meta.env.DEV` so production bundles strip them; never log tokens or emails:
- "Get Started clicked" in welcome `primary.onClick`.
- "navigate → /onboarding/email".
- "/onboarding/email beforeLoad session=yes|no destination=…".
- "redirecting because: <reason>" in each `throw redirect`.

## Files touched
- `src/routes/onboarding.index.tsx` — rewrite welcome `beforeLoad`; add dev log in Get Started handler.
- `src/routes/onboarding.email.tsx` — rewrite `beforeLoad`; add dev logs.
- `src/lib/auth-reset.ts` — add anonymous no-op guard in `resetToOnboarding`.

## Out of scope
Auth architecture, payments, paywall, checkout, subscription rules, visual design — all unchanged. `_app.tsx`, `paywall.tsx`, `checkout.success.tsx`, `logout.tsx`, `index.tsx` not modified.

## Acceptance verification
- A. Clean anon → click Get Started → `/onboarding/email` renders. No reset call.
- B. Anon + stale localStorage → same as A.
- C. Stale/deleted authenticated state on `/onboarding` → splash renders (auth-error path clears state) → click → `/onboarding/email` renders (no session left).
- D. Valid signed-in user on `/onboarding`:
  - paid → `/app`
  - unpaid + complete → `/paywall`
  - unpaid + incomplete → `/onboarding?start=quiz` (URL changes, no loop with `/`).