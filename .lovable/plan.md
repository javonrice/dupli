# Add opt-out X button to the paywall

Right now `/paywall` is a hard wall — once a signed-in user without an active subscription lands there, `_app.tsx` keeps redirecting them back, so there's no way out without closing the tab. Add an X in the top-right corner that lets the user exit gracefully.

## Behavior

- **Signed-in user without subscription** → tap X → sign out → land on `/onboarding` (the public landing/funnel). This is the case you just hit on `jaysfreeapps@gmail.com`.
- **Anonymous visitor** (paywall shown as part of the onboarding funnel) → tap X → go back to `/onboarding`. No sign-out needed.

Signing the user out on close is what actually breaks the paywall loop — otherwise `_app.tsx` would just bounce them back the next time they hit any protected route. From the user's perspective: "I closed the upgrade screen and I'm back at the start."

## Changes

**`src/routes/paywall.tsx`**

1. Import `X` from `lucide-react`.
2. Add a `handleClose` function:
   - If `user`, call `supabase.auth.signOut()`.
   - Then `navigate({ to: "/onboarding", replace: true })`.
3. Render a fixed close button in the top-right of the paywall layout (inside the `pt-safe` header area), styled like the existing back chevron in `signin.tsx`: a 9x9 round tap target with the X icon, `aria-label="Close"`.

That's the whole change — the rest of the paywall (plan toggles, trial buttons, intro offer) stays as-is.
