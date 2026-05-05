# Onboarding auth: detect existing accounts before password step

## Scope

Fix `/onboarding/email` so it detects whether an account already exists, route the user to the correct password mode, and route correctly after login. No DB migrations; no new dependencies.

Note: the project already migrated from Paddle to Stripe. The "PADDLE_ENVIRONMENT" wording in the request is treated as the project's payment environment (`sandbox` vs `live`), which is sourced from `getServerStripeEnv()` (server) and `getStripeEnvironment()` (client) — the same source of truth used by every other subscription check.

## 1. New server function: `checkEmailExists`

Add to `src/server/onboarding.functions.ts`:

- `createServerFn({ method: "POST" })` — public (no `requireSupabaseAuth`).
- Input validated with **Zod**: `{ email: z.string().trim().toLowerCase().email().max(255) }`.
- Implementation:
  - Query `profiles` via `supabaseAdmin` with `.select("id").eq("email", normalizedEmail).limit(1).maybeSingle()`.
  - The `handle_new_user` trigger writes `email` into `profiles` for every auth signup, so this is an exact, indexed-style lookup (1 row max) — no admin pagination, no in-memory filtering.
  - Return strictly `{ exists: boolean }`. No id, provider, timestamps, metadata.
- Lightweight in-memory rate limit per IP (e.g. 20/min) using `getRequestIP` from `@tanstack/react-start/server`; on overflow return `{ exists: false }` (fails open into signup; the password screen's duplicate-user fallback still protects the user). Best-effort only — Workers are multi-instance.
- No raw email logging. On internal error, return `{ exists: false }` (caller treats as signup; duplicate-user fallback handles it).

Edge case: if a user exists in `auth.users` but somehow lacks a profile row, the lookup says "doesn't exist" → user lands in signup mode → `signUp` throws duplicate-user → password screen flips to login mode (requirement #6). Safe.

## 2. `src/routes/onboarding.email.tsx`

On submit:
- Call `checkEmailExists({ data: { email: trimmedLower } })`.
- `exists === true` → `navigate({ to: "/onboarding/password", search: { mode: "login" } })`.
- Else (or on thrown error) → `mode: "signup"`.
- Keep `setPendingEmail(trimmed)` before navigation.

## 3. `src/routes/onboarding.password.tsx`

The screen already supports both modes with the correct titles, subtitles, CTAs, and the duplicate-user fallback (flips to login mode + shows the required inline copy). Two changes:

**a. Post-login routing** — replace `navigate({ to: "/" })` after successful `signInWithPassword`:
```
const res = await getRouteResolution();
if (res.hasActiveSub)              → navigate("/app")
else if (res.onboardingCompleted)  → navigate("/paywall")
else                               → navigate("/onboarding", { search: { start: "quiz" } })
```
Subscription check is first, exactly per spec. On resolver failure, fall back to `/` (existing index route already handles routing).

**b. Post-signup routing** — keep current `navigate({ to: "/onboarding", search: { start: "quiz" } })`. The `handle_new_user` DB trigger already creates the profile row, satisfying "ensure profile exists." No extra round-trip.

## 4. Quiz route target

The codebase has no `/onboarding/quiz` route. The established, working pattern is `/onboarding?start=quiz` — `onboarding.index.tsx` already validates `search.start === "quiz"`, requires an authenticated session, and survives refresh (the search param is in the URL). Use this existing pattern; do not invent a new route.

## 5. Environment consistency

`getRouteResolution` already calls `getServerStripeEnv()` (NODE_ENV-based: production=live, otherwise sandbox), matching `subscription-middleware.ts`, `scan-entitlement-middleware.ts`, and the client `getStripeEnvironment()`. No host inference. No change needed.

## 6. Files touched

- `src/server/onboarding.functions.ts` — add `checkEmailExists`.
- `src/routes/onboarding.email.tsx` — call `checkEmailExists`, branch on `exists`.
- `src/routes/onboarding.password.tsx` — post-login resolver routing.

No DB changes, no new packages.

## Acceptance test mapping

- **A** Existing email → check returns `exists:true` → login mode → resolver routes by sub/onboarding state.
- **B** New email → `exists:false` → signup mode → trigger creates profile → quiz.
- **C** Lookup failure → signup fallback → duplicate-user error in `signUp` flips screen to login mode (already implemented).
- **D** Paid returning user → `hasActiveSub` true → `/app` (subscription check first).
- **E** Unpaid returning user → routed by `onboardingCompleted` to `/paywall` or quiz.
