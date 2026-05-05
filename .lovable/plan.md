
# Architecture Fix v2: Hard Paywall Gating (Approved with Corrections)

Architecture-only. Email/password only. No UI redesign, no pricing changes, no anonymous checkout.

## 1. Shared modules (new)

### `src/lib/access.ts` — single subscription predicate

```ts
export type SubLike = { status?: string|null; current_period_end?: string|null } | null|undefined;
// Decision: KEEP past_due (matches Stripe dunning grace). Applied everywhere.
export const ACTIVE_STATUSES = ["active","trialing","past_due"] as const;

export function isSubscriptionActive(sub: SubLike, nowMs = Date.now()): boolean {
  if (!sub?.status) return false;
  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const future = end === null || end > nowMs;
  if ((ACTIVE_STATUSES as readonly string[]).includes(sub.status) && future) return true;
  if (sub.status === "canceled" && end !== null && end > nowMs) return true;
  return false;
}
```

Used by: `useSubscription`, `getRouteResolution`, `requireActiveSubscription`, `requireScanEntitlement`, `checkout.success.tsx`.

### SQL alignment
Migration to update `public.has_active_subscription` to include `past_due` so SQL matches TS:

```sql
create or replace function public.has_active_subscription(user_uuid uuid, check_env text default 'live')
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid and environment = check_env
    and (
      (status in ('active','trialing','past_due') and (current_period_end is null or current_period_end > now()))
      or (status = 'canceled' and current_period_end > now())
    )
  );
$$;
```

### `src/lib/stripe-env.ts` (client)

```ts
export type StripeEnv = "sandbox"|"live";
export function getClientStripeEnv(): StripeEnv {
  const v = (import.meta.env.VITE_STRIPE_ENVIRONMENT as string|undefined)?.toLowerCase();
  if (v === "live" || v === "sandbox") return v;
  if (import.meta.env.PROD) {
    // Loud warning in prod; keep token-prefix fallback only during transition.
    console.error("[stripe-env] VITE_STRIPE_ENVIRONMENT not set in production build");
  }
  const tok = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string|undefined;
  return tok?.startsWith("pk_live_") ? "live" : "sandbox";
}
```

### `src/lib/stripe-env.server.ts`

```ts
export function getServerStripeEnv(): "sandbox"|"live" {
  const v = process.env.STRIPE_ENVIRONMENT?.toLowerCase();
  if (v === "live" || v === "sandbox") return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error("STRIPE_ENVIRONMENT must be set in production");
  }
  return "sandbox";
}
```

Env files:
- `.env.development`: `STRIPE_ENVIRONMENT=sandbox`, `VITE_STRIPE_ENVIRONMENT=sandbox`
- `.env.production`: `STRIPE_ENVIRONMENT=live`, `VITE_STRIPE_ENVIRONMENT=live`

## 2. Canonical resolver — typed destination shape

`getRouteResolution` (`src/server/onboarding.functions.ts`) now returns:

```ts
type RouteDest =
  | { to: "/app" }
  | { to: "/paywall" }
  | { to: "/onboarding"; search: { start: "quiz" } };

type Resolution = {
  destination: RouteDest;
  hasActiveSub: boolean;
  onboardingCompleted: boolean;
  isSuperUser: boolean;
};
```

Logic, in order:
1. `isSuperUser(userId)` → `{ to: "/app" }`.
2. `isSubscriptionActive(sub)` → `{ to: "/app" }`.
3. `!onboardingCompleted` → `{ to: "/onboarding", search: { start: "quiz" } }`.
4. else → `{ to: "/paywall" }`.

Callers use `navigate({ to: res.destination.to, search: (res.destination as any).search, replace: true })` or `redirect(res.destination)`.

## 3. `/_app` guard

Replace logic in `src/routes/_app.tsx`:
- `authLoading` → splash.
- No user → `<Navigate to="/onboarding/email" replace />`.
- Call `getRouteResolution()`; while loading → splash.
- If `destination.to !== "/app"` → `<Navigate to={destination.to} search={destination.search} replace />`.
- Else render `<Outlet/> + <TabBar/>`.

Removes the "unpaid + onboardingCompleted allowed in" branch.

## 4. `/` route

In `src/routes/index.tsx` `IndexSplash`: if `session` exists, await `getRouteResolution()` and `navigate(res.destination)`. Anonymous flow unchanged. `next=` is honored only when it equals the resolved destination's `to`.

## 5. `/paywall` `beforeLoad`

`beforeLoad` runs on the client (TanStack Start client-side navigation) and on initial SSR. To avoid the SSR pitfall, gate inside the client and use the existing patterns: call the protected server function `getRouteResolution`, which uses `requireSupabaseAuth` (the canonical session source). For the no-session case, do a quick `supabase.auth.getSession()` from the browser client; in SSR (no `window`), skip and let the component-level effect handle it.

```ts
beforeLoad: async () => {
  if (typeof window === "undefined") return; // let component handle SSR
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw redirect({ to: "/onboarding/email" });
  try {
    const res = await getRouteResolution();
    if (res.destination.to !== "/paywall") {
      throw redirect(res.destination);
    }
  } catch (e) {
    if (isRedirect(e)) throw e;
    // swallow: render paywall as fallback
  }
}
```

Remove the `useEffect` that auto-navigates away (resolver guard now covers it).

## 6. Checkout creation — hard rule

`createCheckoutSession` (`src/server/payments.functions.ts`):
- **Require `userId`** in input validator: `if (!data.userId) throw new Error("userId required")`. Remove the anonymous-checkout branch.
- Always set `metadata.userId`.
- Always set `subscription_data.metadata.userId` (recurring) — already does.
- Set Stripe Customer metadata via `customer_creation: "always"` is implicit in subscription mode. Use `subscription_data` metadata as primary; **do NOT promise customer.metadata** — Checkout doesn't reliably set customer metadata at session creation, and the webhook fallback is best-effort only.

## 7. Webhook reconciliation

`src/routes/api/public/payments/webhook.ts`:

- `handleSubscriptionCreated`:
  - `userId = subscription.metadata?.userId ?? null`.
  - If null, fetch `stripe.customers.retrieve(subscription.customer)` and read `customer.metadata?.userId`.
  - If still null, `console.error("[webhook] orphan subscription", { subscriptionId, customerId, env })` and insert with `user_id: null`.
- `handleSubscriptionUpdated`:
  - Resolve `userId` same way.
  - First check existing row; if its `user_id IS NULL` and we now have a `userId`, include `user_id` in the update to reconcile.
- Webhook handler needs `createStripeClient(env)` for the customer retrieval — import from `@/lib/stripe.server`.

## 8. Checkout success resilience

`src/routes/checkout.success.tsx`:
- `POLL_TIMEOUT_MS = 30000`, interval 1s.
- Subscribe to `postgres_changes` on `public.subscriptions` filtered by `user_id=eq.<id>`; on event re-run the active check immediately (alongside polling).
- Use `isSubscriptionActive` from `@/lib/access.ts` and `getClientStripeEnv()`.
- On detected active: best-effort `markOnboardingComplete()` + `completeOnboarding()`, then call `getRouteResolution()` and `navigate(res.destination)` (defensive: if for some reason resolver still returns paywall, fall back to `/app`).
- On stall (>30s, not active): show "Almost there…" with Retry button (resets timer + re-subscribes), and a support link `mailto:support@trydupli.com` plus an "I already paid — check again" button (alias for Retry).
- **Never** auto-navigate to `/paywall`.

## 9. Auth flow cleanup

`src/routes/onboarding.password.tsx`:
- After successful `signUp`: `clearPendingEmail()` then `navigate({ to: "/onboarding", search: { start: "quiz" } })`.
- After successful `signInWithPassword`: `clearPendingEmail()` then call `getRouteResolution()` and `navigate(res.destination)`.

## 10. Subscription middleware + scan entitlement

`src/server/subscription-middleware.ts`:
- Use `isSubscriptionActive` and `getServerStripeEnv()` from new modules.
- Add `if (isSuperUser(userId)) return next({ context });` consistency bypass.

`src/server/scan-entitlement-middleware.ts`:
- Replace inline predicate with `isSubscriptionActive`. Keep existing super-user bypass. Use `getServerStripeEnv()`.

## 11. `useSubscription`

- Use `isSubscriptionActive` and `getClientStripeEnv()`. Keep `isSuperUser` short-circuit.

## 12. Files

New:
- `src/lib/access.ts`
- `src/lib/stripe-env.ts`
- `src/lib/stripe-env.server.ts`
- `supabase/migrations/<ts>_align_has_active_subscription.sql`

Modified:
- `.env.development`, `.env.production`
- `src/server/onboarding.functions.ts`
- `src/server/subscription-middleware.ts`
- `src/server/scan-entitlement-middleware.ts`
- `src/server/payments.functions.ts`
- `src/hooks/use-subscription.ts`
- `src/routes/_app.tsx`
- `src/routes/index.tsx`
- `src/routes/paywall.tsx`
- `src/routes/checkout.success.tsx`
- `src/routes/onboarding.password.tsx`
- `src/routes/api/public/payments/webhook.ts`

No UI changes, no new packages.

## 13. Acceptance

- Unpaid onboarded user → `/app` redirects to `/paywall` (no flash).
- Paid user → `/paywall` redirects to `/app` via `beforeLoad`.
- Anonymous → `/paywall` or `/app` redirects to `/onboarding/email`.
- Checkout success: 30s poll + realtime; never bounces to `/paywall`; stall shows Retry + support.
- Superuser treated active in client hook, server resolver, both middlewares.
- Production server throws if `STRIPE_ENVIRONMENT` missing; client logs error.
- Webhook with missing metadata: customer-metadata fallback, then orphan log.
- `past_due` grants access in TS predicate AND SQL `has_active_subscription`.
- Pending email cleared after both signUp and signInWithPassword.
- `createCheckoutSession` throws if `userId` missing.
