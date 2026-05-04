## Problem

The onboarding welcome screen has a `I already have an account · Sign in` text link that routes to `/login?next=/app`. Two issues:

1. `/login` shows a "Don't have an account? Sign up" toggle, so a returning-user link becomes a sign-up path that **bypasses onboarding and the paywall** entirely.
2. There is no way back to the start of onboarding from `/login` — the user is stuck.

## Fix

Create a dedicated **sign-in only** route for the returning-user flow from onboarding, and route the welcome-screen link there instead of `/login`.

### 1. New route: `src/routes/signin.tsx`

A stripped-down variant of `/login`:

- **Sign-in only.** No mode toggle, no "Create account" button, no sign-up form. Only email + password + "Sign in", plus "Forgot password?".
- **Back button** in the header that returns to `/onboarding` (using `navigate({ to: "/onboarding" })`), so an accidental tap is recoverable.
- Copy: "Welcome back" / "Sign in to your Dupli account."
- A small footer line: *"New here? Go back and finish setup."* — links back to `/onboarding`, never to a sign-up form.
- On successful sign-in, route through `/` (the splash router) so the existing logic decides `/app` vs `/paywall` based on subscription state. This preserves the paywall gate for returning users without an active sub.
- Same `beforeLoad` as `/login`: if already signed in, redirect to `/`.

### 2. Update `src/routes/onboarding.tsx`

Change the welcome-screen `textLink` (line 193–194) from:

```ts
onClick: () => navigate({ to: "/login", search: { next: "/app" } })
```

to:

```ts
onClick: () => navigate({ to: "/signin" })
```

### 3. Leave `/login` as-is

`/login` keeps its dual sign-in / sign-up behavior because it's still the correct destination for the post-paywall and post-checkout flows (where account creation is expected and required).

## Edge cases handled

- **Accidental tap on welcome screen** → back button returns to onboarding step 1.
- **No sign-up path** from `/signin` → cannot bypass onboarding + paywall by signing up.
- **Returning user with no active sub** → routed via `/` splash, lands on `/paywall` (existing behavior).
- **Already signed in** → `beforeLoad` redirects to `/`, same as `/login`.
- **Forgot password** → reuses existing `/reset-password` route.