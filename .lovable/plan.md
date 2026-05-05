## Goal

Replace the current "anonymous → paywall → email-claim" flow with a linear, native-feeling onboarding:

```text
/onboarding → /onboarding/email → /onboarding/password → /onboarding/quiz → /paywall → /checkout/success → /app
```

Auth is collected inside onboarding (early, but feels native). Quiz and paywall both require a session. Anonymous checkout and the email-claim screen are removed.

## Routing changes

### New routes

**`src/routes/onboarding.email.tsx`** (anonymous)
- Email input + "Continue" + "Continue with Google".
- Stores trimmed email in `sessionStorage` key `dupli.onboarding.email`.
- On submit:
  - If `signInWithOtp({ shouldCreateUser: false })`-style probe is unreliable → default to **signup mode**, navigate to `/onboarding/password?mode=signup`.
  - Catch "User already registered" on the password screen and switch modes inline (no extra round-trip).
- Google: reuse `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/?next=/onboarding/quiz" })`.

**`src/routes/onboarding.password.tsx`** (anonymous until submit)
- `validateSearch`: `{ mode: "signup" | "login" }` (defaults `signup`).
- Reads pending email from sessionStorage; if missing → redirect `/onboarding/email`.
- Signup: `supabase.auth.signUp({ email, password })`. On `User already registered` → flip to `mode=login` with inline message.
- Login: `signInWithPassword`. Wrong password → inline error.
- After success → resolver (below) navigates.
- Back chevron → `/onboarding/email`.

### Updated routes

**`src/routes/onboarding.tsx`** (intro/quiz)
- Welcome screen "Get Started" → `/onboarding/email` (instead of advancing in-place).
- Add a route guard: only the **welcome step** is anonymous. The personalization steps (`gender` … `sample_result`) require a session. To keep the file simple: split the file so the quiz steps live behind a session check; if no session and step != welcome, redirect to `/onboarding/email`.
- Quiz answers: keep localStorage for UX, but also call a new `saveOnboardingProfile` server function (writes to `profiles` row — add columns) once authenticated, so answers are user-scoped.
- `markOnboardingComplete` continues to set `localStorage`; **also** persist `onboarding_completed=true` on the user's profile for the resolver to read across devices.

**`src/routes/paywall.tsx`**
- Add `beforeLoad`: if no session → `redirect({ to: "/onboarding/email" })`.
- Remove the duplicate `useEffect` subscription gate (rely on `useSubscription` + `beforeLoad`). Keep the active-sub check that redirects to `/app`.
- Remove the anonymous-checkout branch in `startTrial` / `startCheap`. Always `customData: { userId: user.id }` and `successUrl = ${origin}/checkout/success`.
- Close (X) button: just `navigate({ to: "/onboarding" })` — do NOT sign the user out (their account is real now).

**`src/routes/checkout.success.tsx`** (new)
- Requires session.
- Polls `subscriptions` (filtered by user_id + current env) every 1s for up to 10s.
- On active/trialing row → `navigate("/app")`.
- Otherwise show "Finalizing your subscription…" with a manual Retry button.

**`src/routes/_app.tsx`**
- Delete `GRACE_KEY`, `GRACE_MS`, and both `useEffect`s.
- Keep auth + sub gate. `!user → /onboarding/email`. `!isActive → /paywall`.

**`src/routes/index.tsx`**
- Resolver behavior on landing:
  1. Session + active sub → `/app`
  2. Session, no sub, onboarding_completed → `/paywall`
  3. Session, no sub, onboarding incomplete → `/onboarding/quiz`
  4. No session, onboarded flag locally → `/onboarding/email`
  5. No session, fresh → `/onboarding`

### Deleted routes

- **`src/routes/checkout.account.tsx`** — delete.
- **`src/routes/login.tsx`** — keep (still useful as a pure sign-in entry from the paywall "Already a member?" link), but simplify: remove paywall-aware copy.

## Server / DB

**`src/server/subscription-middleware.ts`**
- Remove host regex. Read env strictly from `process.env.PADDLE_ENVIRONMENT`; if unset, fall back to `"sandbox"` only when `process.env.NODE_ENV !== "production"`, else `"live"`. No host sniffing.
- Make sure `.env.development` has `PADDLE_ENVIRONMENT=sandbox` and `.env.production` has `PADDLE_ENVIRONMENT=live`.

**Migration**
- Add `profiles.onboarding_completed boolean default false`.
- Add `profiles.onboarding_answers jsonb default '{}'::jsonb`.
- Drop unused functions: `claim_subscriptions_for_current_user`, `claim_subscriptions_by_customer_id` (only after confirming no remaining import via `rg`).

**`src/server/claim.functions.ts`** — delete after the routes that import it are gone.

## Helper additions

**`src/lib/onboarding.ts`**
- Add `setPendingEmail(email)` / `getPendingEmail()` / `clearPendingEmail()` using sessionStorage.
- Add `resolveAfterAuth(userId)` helper that runs the routing rules above (calls a server fn that returns `{ hasActiveSub, onboardingCompleted }`).

**`src/server/profile.functions.ts`**
- `getRouteResolution`: returns `{ hasActiveSub, onboardingCompleted }` for current user (server fn with `requireSupabaseAuth`).
- `saveOnboardingAnswers({ answers })`: upserts into `profiles.onboarding_answers`.
- `completeOnboarding()`: sets `onboarding_completed = true`.

## Acceptance mapping

A–I covered by the route changes above. Specifically:
- (D)(E) → `beforeLoad` guards on `/onboarding/quiz` and `/paywall`.
- (F) → paywall `beforeLoad` checks active sub, redirects to `/app`.
- (G) → `/_app` gate redirects to `/paywall`.
- (H) → `/checkout/success` polling page replaces the grace dance.
- (I) → env strictly from `PADDLE_ENVIRONMENT`.

## Out of scope
- No pricing/catalog changes.
- No webhook handler changes.
- No visual redesign — new screens reuse existing `OnboardingShell` styling.
