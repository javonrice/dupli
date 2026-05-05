# Fix: "Get Started" appears to do nothing on /onboarding/email

## Root cause

TanStack Start's flat dot-separated routing treats `src/routes/onboarding.tsx` as the **layout/parent** for `src/routes/onboarding.email.tsx` (and `onboarding.password.tsx`). A parent route with children must render `<Outlet />` for the child to appear.

`onboarding.tsx` does NOT render an Outlet — it always renders its own welcome/quiz UI based on local `step` state. So when the user clicks "Get Started":

1. `navigate({ to: "/onboarding/email" })` fires and the URL updates to `/onboarding/email`.
2. The router matches both `/onboarding` (parent) and `/onboarding/email` (child).
3. The parent renders the welcome screen and never mounts the child → screen looks unchanged. Button "does nothing."

The screenshot confirms it: URL is `/onboarding/email` but the welcome hero is visible.

## Fix

Rename `src/routes/onboarding.tsx` → `src/routes/onboarding.index.tsx`.

This makes `/onboarding` a leaf route (sibling to `/onboarding/email` and `/onboarding/password`) instead of a layout parent. Each screen owns its own URL and no Outlet is needed.

## Files

- Rename `src/routes/onboarding.tsx` → `src/routes/onboarding.index.tsx`
  - Change `createFileRoute("/onboarding")` → `createFileRoute("/onboarding/")`
- No other code changes required. `routeTree.gen.ts` regenerates automatically.

## Out of scope

No changes to onboarding flow, auth, paywall, checkout, or styling.
