## Goal

Eliminate the "deleted/stale-user paywall trap." A user must only land on `/paywall` when they have a valid session, completed onboarding, and no active subscription. Any auth/resolver failure should sign out, clear stale state, and route to `/onboarding` — never to `/paywall`.

## Root cause

Multiple guards currently treat resolver failures as "render paywall as safe fallback":

- `src/routes/_app.tsx` — catch block sets destination to `/paywall`
- `src/routes/paywall.tsx` — `beforeLoad` and the in-component effect both fall through to rendering paywall on resolver error
- `src/routes/checkout.success.tsx` — when resolver returns `/paywall`, falls back to `/app`, but never handles "auth invalid" (deleted user); polling loop just stalls
- `src/routes/index.tsx` — on resolver failure redirects to `/paywall`
- `src/routes/onboarding.index.tsx` — `welcome` step's `beforeLoad` sends any session-bearing visitor to `/` even if that session belongs to a deleted user (which then loops via index → paywall)
- `src/lib/onboarding.ts` `isOnboarded()` is read on the public path, so leftover localStorage can still influence routing

The server resolver (`requireSupabaseAuth`) throws a `Response(401)` for invalid/expired/deleted-user tokens. Today none of the callers distinguish "401 → auth dead" from "500 → transient" — both fall through to paywall.

## Plan

### 1. New helper: `src/lib/auth-reset.ts`

Single source of truth for "this session is dead, restart cleanly."

```ts
clearStaleClientState()    // remove dupli.onboarding.v1, dupli.onboarding.pending_email,
                           // dupli.paywall.plan, dupli.checkout.*, dupli.paywall.reason,
                           // dupli.scan.* keys. Leave unrelated keys alone.

isAuthError(err): boolean  // true for fetch Response status 401/403, supabase
                           // AuthApiError codes (user_not_found, invalid_jwt,
                           // bad_jwt, session_not_found), and "Unauthorized"
                           // text from our middleware.

async resetToOnboarding(navigate?)  // signOut() best-effort → clearStaleClientState()
                                    // → navigate/redirect to "/onboarding"
```

### 2. Update each route guard to use the helper

**`src/routes/_app.tsx`**
- Wrap `getRouteResolution()` in try/catch.
- On `isAuthError` → `await resetToOnboarding(navigate)` then return `<Navigate to="/onboarding" />`.
- On non-auth error → keep showing splash with a small retry; do NOT default to `/paywall`.

**`src/routes/paywall.tsx`**
- `beforeLoad`: if no session → redirect `/onboarding` (already does). If `getRouteResolution` throws and `isAuthError` → call cleanup synchronously (signOut + clear) then `throw redirect({ to: "/onboarding" })`. Remove "render paywall as safe fallback" comment + behavior. On non-auth error, still throw the error so the route's errorComponent can show retry instead of silently rendering paywall.
- In-component `useEffect`: same — on auth error, `resetToOnboarding`; on transient error, set an error state with retry button instead of `setVerified(true)`.

**`src/routes/checkout.success.tsx`**
- In `checkOnce`: if `supabase.auth.getSession()` returns no session → `resetToOnboarding`.
- Wrap the subscriptions query and resolver calls; if 401/auth error → `resetToOnboarding`.
- Keep current "stalled → Retry/support" UI for the no-subscription-yet case (already correct, no auto-bounce to paywall).

**`src/routes/index.tsx`**
- Replace the `catch { navigate("/paywall") }` fallback with `isAuthError ? resetToOnboarding : navigate("/onboarding")`. Never default to paywall.

**`src/routes/onboarding.index.tsx`**
- `beforeLoad` welcome path: when `data.session` exists, call `getRouteResolution()` first. If it throws auth error → `resetToOnboarding` (no redirect to `/`). Only if resolver succeeds do we redirect to `/`.
- Welcome step (anonymous) must always render the splash regardless of `isOnboarded()` localStorage. Confirmed already (no `isOnboarded()` read here) — just make sure the `beforeLoad` doesn't trust a dead session.

**`src/hooks/use-auth.ts`**
- In `onAuthStateChange`, if event is `SIGNED_OUT` or session becomes null, optionally call `clearStaleClientState()` (keeps localStorage from re-poisoning a fresh anon visit). Do NOT await Supabase calls inside the callback.

**`src/routes/logout.tsx`**
- Replace ad-hoc `localStorage.clear()` with `clearStaleClientState()` so we don't nuke unrelated keys, then `signOut` + redirect (existing behavior).

### 3. Server-side: surface auth errors clearly

`src/integrations/supabase/auth-middleware.ts` already throws `Response(401, "Unauthorized: …")`. Confirm callers can detect this via `err instanceof Response && err.status === 401` — that's what `isAuthError` will check first. No server changes needed beyond confirming the contract.

### 4. Acceptance test mapping

| Test | Covered by |
|---|---|
| A. Deleted user visits `/app` | `_app.tsx` catch → `resetToOnboarding` |
| B. Deleted user visits `/paywall` | `paywall.tsx` `beforeLoad` + effect |
| C. Deleted user visits `/checkout/success` | `checkout.success.tsx` `checkOnce` auth-error branch |
| D. Anon w/ stale localStorage on `/onboarding` | welcome step renders unconditionally; `beforeLoad` no longer trusts dead session |
| E/F/G. Normal valid users | Unchanged resolver outcomes |

### Out of scope (per request)

- No pricing, checkout, UI redesign, or auth-provider changes.
- No new visible "close paywall" button.

## Files touched

- `src/lib/auth-reset.ts` *(new)*
- `src/routes/_app.tsx`
- `src/routes/paywall.tsx`
- `src/routes/checkout.success.tsx`
- `src/routes/index.tsx`
- `src/routes/onboarding.index.tsx`
- `src/routes/logout.tsx`
- `src/hooks/use-auth.ts` *(small)*
