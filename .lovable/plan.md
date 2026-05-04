
## Edge cases found

Auditing the current flow surfaced 5 gaps. None are visible on the happy path, but each one strands a real user.

### 1. Email signup has no "verify your email" state
`supabase.auth.signUp` returns success but no session until the user clicks the confirmation link. Today the form just clears its spinner and the user sits on the login screen with no feedback. They'll either re-submit (getting silent rate-limit errors) or assume it's broken.

**Fix:** when signup returns no session, swap the form for a "Check your inbox" panel showing the email and a "Resend email" action.

### 2. Already-signed-in users can re-enter onboarding
`/onboarding` has no auth check. A returning user who visits the root after clearing localStorage (or who taps the wordmark) re-does the whole onboarding flow and is then sent to `/paywall` even though they're already a customer.

**Fix:** in `/onboarding` `beforeLoad`, if a session exists redirect to `/app` (which itself now handles paywall logic — see #3).

### 3. Paywall shows for users who already paid
After signup→paywall flow, if the user happens to already have an active subscription on this account (e.g. signed in mid-flow on a new device), `/paywall` still renders and prompts them to subscribe again.

**Fix:** in `/paywall` `beforeLoad`, query `subscriptions` for the current user + env. If active, redirect to `/app`.

### 4. Index `next` allowlist includes `/onboarding`
`/?next=/onboarding` is currently honored, which can route a freshly-authenticated user *back* into onboarding. That's never the intent — onboarding is for unauthenticated/new users only.

**Fix:** drop `/onboarding` from the allowlist; only `/app` and `/paywall` are valid post-auth destinations.

### 5. Sample-result path marks onboarding complete *before* auth
In `onboarding.tsx` the "Unlock full comparison" button calls `markOnboardingComplete()` then navigates to `/paywall`. If the user bounces at the login wall and returns later, they skip onboarding and land on `/login` → `/app` as a free user. That's actually acceptable, but we should NOT mark complete until after they reach the paywall — otherwise the sample-result CTA is the only thing they ever see of the onboarding "first match" experience if they abandon.

**Fix:** move `markOnboardingComplete()` to fire on successful arrival at `/app` (already happens via `?checkout=success`) and on paywall dismiss (already happens). Remove the premature calls in onboarding's sample-result handlers — `/paywall` itself ensures they don't land back in onboarding because the welcome screen's "Sign in" link covers the returning-user case.

## Files to change

- `src/routes/login.tsx` — add post-signup "check your email" state with resend
- `src/routes/onboarding.tsx` — `beforeLoad` redirect for signed-in users; remove premature `markOnboardingComplete()` in sample-result handlers
- `src/routes/paywall.tsx` — `beforeLoad` skip when active subscription exists
- `src/routes/index.tsx` — tighten `next` allowlist to `["/app", "/paywall"]`

No DB changes, no new dependencies.
