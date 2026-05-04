## Goal

Stop showing the marketing landing page at `/`. Keep the landing page in the codebase and reachable, but only via a direct URL that isn't linked from anywhere in the app. Onboarding will replace it later — not part of this change.

## Behavior change

- Visiting `/` no longer renders the landing page.
  - If the user has a session → send them to `/app`.
  - If not → send them to `/login`.
- The landing page content moves to `/landing` (unlisted route, no nav links to it). Anyone with the direct URL can still view it.
- No other UI changes. No onboarding flow added yet — `/` just routes to login or app for now. That's a deliberate placeholder until onboarding is built.

## Files to change

1. **`src/routes/index.tsx`** — replace the `LandingPage` component with a route that redirects in `beforeLoad`:
   - Check the Supabase session (same pattern as `src/routes/_app.tsx`).
   - `throw redirect({ to: "/app" })` if signed in, else `throw redirect({ to: "/login" })`.
   - Drop the `LandingPage` JSX from this file.

2. **`src/routes/landing.tsx`** (new) — move the existing `LandingPage` component here verbatim with `createFileRoute("/landing")`. Keep the same `head()` meta so the page still has its OG/Twitter tags if someone shares the direct link.

3. **`src/routes/login.tsx`** — audit for any `<Link to="/">` that points back to the marketing page and either remove it or repoint to `/landing`. (Will confirm during implementation.)

4. **`src/routes/__root.tsx`** — no change needed; meta tags stay generic for the app.

## Notes

- `routeTree.gen.ts` regenerates automatically — don't touch it.
- The landing page's "Get started" / "Open app" CTAs continue to work from `/landing`.
- This is purely a routing change; no DB, no auth changes, no removed features.
- Once you're ready for onboarding, `/` becomes the onboarding flow and the unauth redirect target switches from `/login` to `/` (or onboarding stays at `/onboarding` and `/` shows it for new users). We'll decide then.
