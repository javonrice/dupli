# MVP Launch Readiness — QA Findings & Fix Plan

I pressure-tested onboarding → auth → paywall → checkout → app. Below is every issue ranked by severity, then the proposed fix plan.

---

## CRITICAL — will break paying customers on day one

### C1. Post-checkout return drops users on `/login`
`src/routes/_app.tsx` runs `supabase.auth.getSession()` inside `beforeLoad`. `beforeLoad` runs during SSR. The browser Supabase client has no storage on the server, so `getSession()` always returns `null` server-side and the route throws `redirect({ to: "/login" })`.

Paddle's `successUrl` is a full page navigation to `/app?checkout=success`. That goes through SSR → redirected to `/login` → search params (including `checkout=success`) are lost → the 20-second grace window in `AppLayout` never arms → user who just paid sees a login screen.

The same bug breaks every deep link to `/app/*` (bookmarks, share links, scan deep links, browser refresh).

**Fix:** Remove the SSR session check from `_app` `beforeLoad` (mirroring the comment already in `paywall.tsx` and `index.tsx`). Keep the client-side guard in `AppLayout`. Persist the grace window to `sessionStorage` so it survives the cleanup `replace` in `app.tsx`.

### C2. Premium server functions are not subscription-gated
`scanProduct`, `saveScan`, etc. only require auth (`requireSupabaseAuth`). Any signed-in user can call them directly with curl/devtools regardless of subscription. The paywall is a client-only fence.

**Fix:** Add a small `requireActiveSubscription` server helper and apply it to premium server functions (scan, save, share). It reads the user's latest subscription row in the current env and reproduces the `isActive` logic, returning 402/403 otherwise. Keep onboarding's "first sample scan" path on a separate non-gated handler (or rate-limit by IP) so the funnel still works for anonymous users.

### C3. Paywall "X" button creates a redirect loop / bypass
`dismiss()` calls `markOnboardingComplete()` and `navigate({ to: "/app" })`. With C1 fixed, `_app` will bounce them right back to `/paywall`, producing a loop. Without C1, they end up on `/login`.

**Fix:** The X should not pretend to grant access. Either:
- Remove the close button entirely (recommended for a hard paywall), or
- Send the user back to `/onboarding`'s last screen / `/` splash, never to `/app`.

Pick one in the next message; default to "remove X".

---

## HIGH — broken UX or data correctness

### H1. No password-reset flow
`login.tsx` has no "Forgot password" link and no `/reset-password` route exists. A user who forgets their password is locked out forever. This is a launch blocker per Lovable's auth requirements.

**Fix:** Add a "Forgot password?" link → screen that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" })`. Add a public `/reset-password` route that detects `type=recovery` and calls `supabase.auth.updateUser({ password })`.

### H2. Email confirmation traps freshly-paid users
If a user signs up *during* checkout (the paywall pushes anon users to `/login?next=/paywall`), Supabase email confirmation is on by default → they hit "Check your inbox" → can't return to checkout in the same tab. We currently never auto-confirm.

**Fix:** Enable auto-confirm signups (`mailer_autoconfirm = true`) so account creation completes the trip back to `/paywall` and into Paddle's overlay. (You confirmed in the prior turn this is the desired behavior for paid flow.) If you want email verification, we instead need to: (a) require account creation BEFORE paywall and (b) handle the "verify then return to checkout" round trip via a stored intent.

### H3. Realtime subscription channel doesn't filter env
`useSubscription` realtime filter is `user_id=eq.…` only. After publish, both sandbox + live rows fire events into the same client channel. The `load()` re-query does filter by env, so functionally OK today, but a transient event for the wrong env can flicker `isActive` true→false→true. Low risk but noted.

**Fix:** Add a refetch debounce (50ms) and ignore payloads whose `environment` doesn't match.

### H4. Webhook silently defaults to `sandbox` on missing `?env=`
`webhook.ts` defaults to `sandbox` if the query param is missing. If a misconfigured live notification ever omits `?env=`, a real paying customer's row lands in sandbox and they get bounced to paywall in production.

**Fix:** Reject (`400`) when `?env=` is missing or not in `('sandbox','live')`. Log loudly.

### H5. Logout button only signs out, leaves stale state
`profile.tsx` `handleSignOut` calls `signOut()` then `navigate({ to: "/login" })`. The cached `useSubscription` data and any in-flight loaders for `/_app/*` aren't invalidated. On a fast device, the next mount of `_app` may briefly show authed UI before the `onAuthStateChange` listener fires.

**Fix:** After `signOut()`, do a hard `window.location.assign("/login")` to wipe all client state.

---

## MEDIUM

### M1. `/login` 10-tap logo backdoor in production
`handleLogoTap` in `login.tsx` clears `localStorage` + `sessionStorage` + signs out after 10 taps. Useful for QA, dangerous as a hidden button in production. A curious user could nuke their own session/onboarding answers by accident.

**Fix:** Gate behind `import.meta.env.DEV` only.

### M2. `landing.tsx` is orphaned
Nothing links to `/landing`. Either wire it as the public marketing page (and route SEO crawlers there) or delete it. Today `/` is a splash → onboarding/login, which is bad for SEO and shareability.

**Fix:** Decide: keep as `/` for unauthenticated visitors, or delete. Recommend keeping and using as `/` for first-touch with onboarding behind a CTA.

### M3. No "Already have an account?" on the paywall
A returning user who lands on `/paywall` from a marketing link has no path to sign in (only "Start trial" / "$0.99" / X). They'd be forced to create a duplicate account.

**Fix:** Add a small "Already a member? Sign in" link at the bottom that routes to `/login?next=/app`.

### M4. `_app.tsx` shows a spinner while `!isActive && !inGrace`
The render guard `(!isActive && !inGrace)` keeps the spinner up while `useEffect` schedules the redirect to `/paywall`. Net effect is OK (spinner → paywall), but if the paywall itself decides the user IS active (race with realtime), they'll see two redirects. Minor.

**Fix:** Replace the navigate-on-effect with a `throw redirect()` style guard or render `<Navigate to="/paywall" />` to make the transition synchronous.

### M5. Profile rows: `Notifications`, `Appearance`, `Privacy & data`, `Help & support`, `Terms`, `Privacy Policy` are inert
They look tappable, do nothing.

**Fix:** Either wire them (Terms → `/terms`, Privacy → `/privacy` already exist) or remove. Minimum: wire the two legal links and hide the others until built. Add a "Manage subscription" row that opens Paddle's customer portal (server fn returning `customerPortalSessions.create(...)`).

### M6. No "Manage / cancel subscription" UI
Paying customers have no in-app way to cancel or update payment method. Required for Paddle compliance and basic customer trust.

**Fix:** Add a "Manage subscription" row in Profile → server function that creates a Paddle customer portal session for the current user's `paddle_customer_id` and opens it in a new tab.

---

## LOW / polish

- L1. `onboarding.tsx` `beforeLoad` also calls `getSession()` server-side; same SSR-no-session issue as C1 but the wrong direction is harmless (signed-in user sees onboarding briefly until client redirect). Fix consistently.
- L2. `paywall.tsx` `requireUser` doesn't preserve which plan the user picked. After login, they land back on paywall but plan resets to "yearly". Stash `plan` in `sessionStorage` and restore.
- L3. `tab-bar` is rendered globally inside `_app`. On scan/results screens it overlaps the bottom CTA. Confirm it hides when `flow.stage !== 'idle'`.
- L4. No consistent error UI when a server function 401s. Wire `errorComponent` on each `_app/*` route.
- L5. The post-purchase toast `"Welcome to Dupli Pro 🎉"` fires on every visit with `?checkout=success`, including refreshes before we replace the URL. Add a `sessionStorage` flag so it only fires once.

---

## Final QA checklist after fixes

| Scenario | Expected |
| --- | --- |
| Fresh install → `/` | Onboarding |
| Finish onboarding → paywall → "Start trial" anonymous | Routes to login with `next=/paywall` |
| Login → returns to paywall | Plan + intro selection preserved |
| Pay in Paddle overlay → success URL | Lands in `/app`, grace covers webhook latency, `isActive` flips true |
| Hard refresh `/app` while signed-in subscriber | Stays on `/app` (no SSR bounce to login) |
| Hard refresh `/app` while signed-in non-subscriber | Routed to `/paywall` |
| Curl `scanProduct` without active sub | 402/403 (C2) |
| Forgot password | Email link → `/reset-password` → new password works |
| Cancel from Paddle portal | Access until `current_period_end`, then paywall |
| Logout from Profile | Hard reload to `/login`, no stale data |
| Paywall X button | Either gone, or routes back to onboarding (no `/app` bypass) |
| Webhook with missing `?env=` | 400, no row written |
| Production login logo taps | No backdoor (dev-only) |

---

## Implementation order for next turn

1. **C1** — strip SSR session check from `_app` and persist grace window.
2. **C2** — `requireActiveSubscription` middleware + apply to premium server fns.
3. **C3** — remove or redirect-back the paywall X.
4. **H1** — Forgot password + `/reset-password`.
5. **H2** — enable email auto-confirm (one-line auth config).
6. **H4** — webhook env validation.
7. **H5 / M4 / M5** — logout hard-reload, Navigate-based redirect, wire profile rows.
8. **M6** — Paddle customer portal in Profile.
9. **M1, M3, L1–L5** — polish pass.

I'll implement in that order. Want me to also (a) keep email confirmation ON and instead build a "verify then resume checkout" round-trip, or (b) auto-confirm as recommended? And on **C3**: remove the paywall X entirely, or redirect-back to onboarding?
