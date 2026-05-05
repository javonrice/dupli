## Plan to clean up the full user flow

I will fix the flow by making one canonical route decision system drive all entry points, then update the onboarding, paywall, and app gates to use it consistently. I will not change design, pricing, checkout UI, onboarding screens, filters, tracking, or database schema.

### Target behavior

```text
No valid session
  → /onboarding
  → Get Started → /onboarding/email

Valid session + onboarding incomplete
  → /onboarding?start=quiz

Valid session + onboarding complete + no active subscription
  → /paywall

Valid session + active subscription
  → /app

Deleted / expired / broken session
  → sign out + clear stale routing state + /onboarding

Temporary resolver/network issue
  → loading/retry state or safe public onboarding reset
  → never /paywall as a fallback
  → never /app unless entitlement is confirmed
```

## Changes I will make

### 1. Centralize routing helpers

Create a small shared client-side routing helper, likely under `src/lib/auth-routing.ts`, with these responsibilities:

- Read the browser session only on the client.
- Call `getRouteResolution()` only when a real session exists.
- Translate the canonical destination into safe navigation options.
- Treat auth failures as stale/deleted users: sign out, clear stale state, return `/onboarding`.
- Treat transient failures separately from auth failures so they are not mistaken for unpaid users.

This prevents every route from inventing its own slightly different fallback behavior.

### 2. Fix `/onboarding` welcome + quiz guard

Update `src/routes/onboarding.index.tsx` so:

- Anonymous users always render the branded splash.
- The Get Started button always navigates to `/onboarding/email`.
- `/onboarding?start=quiz` is only for authenticated users whose server state says onboarding is incomplete.
- A signed-in user on `/onboarding` is routed by canonical state:
  - paid → `/app`
  - onboarding complete unpaid → `/paywall`
  - onboarding incomplete → `/onboarding?start=quiz`
- Broken/stale sessions are signed out and returned to the splash.
- Transient failures do not redirect to the paywall.

Important fix: I will remove the current fragile behavior where the `start=quiz` guard checks only `res.onboardingCompleted` and redirects to `/`; it should route by `res.destination` instead.

### 3. Fix `/onboarding/email` and `/onboarding/password`

Update the email and password auth screens so:

- Anonymous users can always see `/onboarding/email`.
- Signed-in users are routed by canonical state, not blanket-redirected to `/`.
- Stale/deleted sessions are cleared and allowed to render the public email screen.
- Password signup/login still sends incomplete users into the quiz.
- Finished unpaid users can still reach `/paywall` after login.
- Paid returning users go to `/app` after login.

### 4. Fix the “Your Dupli plan is ready” Continue button

Update the final onboarding step in `src/routes/onboarding.index.tsx` so Continue:

- Marks onboarding complete locally and server-side.
- Then routes based on canonical state.
- For a newly completed unpaid user, reliably navigates to `/paywall`.
- If payment/subscription is already active, routes to `/app`.
- If the session is stale/deleted, resets to `/onboarding`.
- If there is a temporary server/network failure after saving, shows a retryable error instead of silently bouncing to the wrong place.

This restores the paywall for valid unpaid completed users without using paywall as an error fallback.

### 5. Fix `/paywall` so it is reachable only for the right users

Update `src/routes/paywall.tsx` so:

- Anonymous users go to `/onboarding`.
- Incomplete onboarding users go to `/onboarding?start=quiz`.
- Finished unpaid users can actually see the paywall.
- Paid users go to `/app`.
- Deleted/stale sessions are signed out and sent to `/onboarding`.
- Transient failures show a loading/retry state instead of redirecting to `/onboarding` or incorrectly showing paywall.

I will avoid a permanent spinner by adding a small retry/error path for resolver failures.

### 6. Fix `/app` access gate

Update `src/routes/_app.tsx` so:

- Only paid users render app content.
- Finished unpaid users go to `/paywall`.
- Incomplete users go to `/onboarding?start=quiz`.
- Broken/stale users reset to `/onboarding`.
- Transient failures do not route to `/paywall`; they show retry/loading instead.

### 7. Fix root `/` resolver behavior

Update `src/routes/index.tsx` so returning users are routed using the same canonical helper:

- No session → `/onboarding`
- Incomplete → quiz
- Complete unpaid → paywall
- Paid → app
- Broken/stale → reset onboarding
- Temporary errors → retry/loading, not paywall/app

This matters for OAuth redirects, returning users, and users opening the site root.

### 8. Keep stale-state cleanup safe

Review `src/lib/auth-reset.ts` and adjust only if needed so:

- It clears stale auth/routing state for broken sessions.
- It does not break a clean anonymous Get Started flow.
- It does not wipe unrelated storage.
- It does not leave stale paywall/onboarding state that can cause loops.

### 9. Acceptance checks I will use

I will verify the code paths for each required user type:

1. New/logged-out user
   - `/onboarding` renders splash
   - Get Started → `/onboarding/email`
   - no paywall

2. Started onboarding but not finished
   - root or onboarding entry resolves to `/onboarding?start=quiz`
   - no paywall
   - no app

3. Finished onboarding but unpaid
   - root resolves to `/paywall`
   - direct `/paywall` renders
   - cannot enter `/app`

4. Paid user
   - root/onboarding/paywall resolves to `/app`
   - does not see onboarding or paywall

5. Deleted/stale/broken user
   - auth failures sign out and clear stale routing state
   - ends at `/onboarding`
   - not trapped at paywall
   - not stuck loading

6. Returning user on a new device
   - after login, canonical resolver sends them to quiz/paywall/app based on server state

7. Temporary connection issue
   - no fallback to paywall
   - no fallback into app
   - user sees loading/retry or safe public reset depending on route

## Out of scope

- No design changes.
- No pricing changes.
- No checkout flow changes except preserving existing success behavior.
- No database schema changes.
- No changes to tracking event names or analytics intent.
- No changes to onboarding screen content/layout.