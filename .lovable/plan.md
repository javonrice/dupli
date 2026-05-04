
# Integrate RevenueCat (web + iOS), retire local subscription state

## Goal

RevenueCat becomes the **single source of truth** for "is this user pro?". Paddle stays as the web payment processor — but RC owns the webhook and entitlement state. iOS uses Apple IAP via the BuildNatively `NativelyPurchases` bridge against the same RC entitlement.

```text
iOS WebView  → NativelyPurchases (Apple IAP) ─┐
                                              ├─→ RevenueCat → entitlement "pro_access"
Web browser  → Paddle Checkout (existing)    ─┘                       │
                                                                      ▼
                                                  app reads via RC REST + SDK
```

---

## What you do in RevenueCat (one-time setup)

1. Create a project in RevenueCat.
2. **Web tab** → Paddle → "Add Paddle config" → connect your Paddle account → import products (`dupli_pro_monthly`, `dupli_pro_yearly`, `dupli_pro_intro_monthly`).
3. **iOS app tab** → add bundle ID (the BuildNatively wrapper's bundle ID) → upload App Store Connect shared secret → import StoreKit products from App Store Connect with the same identifiers.
4. Create entitlement: **`pro_access`**.
5. Attach all 3 web products + both iOS products to `pro_access`.
6. Create offering **`default`** with packages: `$rc_monthly`, `$rc_annual` (intro stays as a separate offering or promo).
7. Point Paddle's webhook to the RC URL RC gives you (replaces our `/api/public/payments/webhook`).
8. Send me three secrets:
   - `REVENUECAT_SECRET_API_KEY` (REST v2, server-side)
   - `VITE_REVENUECAT_IOS_KEY` (public SDK key for iOS)
   - `VITE_REVENUECAT_WEB_KEY` (public SDK key for web — only if you want the JS SDK; we can also just use REST)

---

## Code changes

### 1. New entitlement layer (replaces `useSubscription`)

- `src/lib/revenuecat.ts` — client helpers: `isNative()`, `nativePurchase(packageId)`, `nativeRestore()`.
- `src/server/revenuecat.functions.ts` — server function `getEntitlement({ userId })` that calls RC REST `GET /subscribers/{app_user_id}` with the secret key and returns `{ active: boolean, willRenew, expiresAt, productId, store }` for entitlement `pro_access`.
- `src/hooks/use-entitlement.ts` — replaces `useSubscription`. Calls the server function, caches result, exposes `{ isActive, loading, refresh }`. No more Supabase realtime on `subscriptions`.

### 2. Paywall — branch by platform

In `src/routes/paywall.tsx`:
- If `isNative()` → call `window.NativelyPurchases.purchasePackage("$rc_monthly" | "$rc_annual")`. Apple IAP sheet pops up; on success, refresh entitlement.
- Else → existing Paddle checkout flow (unchanged). RC catches the Paddle webhook and updates entitlement.
- Replace the `subscriptions` table lookup in `beforeLoad` with the new `getEntitlement` server function.

### 3. Restore purchases (iOS requirement)

- Add a "Restore Purchases" button in `src/routes/_app/profile.tsx` (Apple requires this). On iOS, calls `NativelyPurchases.restorePurchases()`; on web, refreshes entitlement.

### 4. Identity linking

- On login/signup: call `NativelyPurchases.logIn(supabaseUserId)` on iOS so RC's `app_user_id` = Supabase user ID. Web uses the same ID via REST. This is what makes a user who paid on iOS automatically pro on web (and vice versa).

### 5. Retire local subscription state

- **Delete** `src/routes/api/public/payments/webhook.ts` (RC owns the webhook now).
- **Delete** `src/hooks/use-subscription.ts`.
- **Delete** all reads of the `subscriptions` table (paywall `beforeLoad`, anywhere `useSubscription` is imported).
- **Migration**: drop `public.subscriptions` table and `has_active_subscription()` function.
- Keep `src/lib/paddle.ts`, `src/lib/paddle.server.ts`, `src/server/payments.functions.ts`, `usePaddleCheckout` — still needed to open Paddle checkout on web.
- Keep `PaymentTestModeBanner`.

### 6. Secrets

After you create the RC project, I'll request:
- `REVENUECAT_SECRET_API_KEY` (server-side, never exposed)
- `VITE_REVENUECAT_IOS_KEY` (public, safe in bundle)
- `VITE_REVENUECAT_WEB_KEY` (public, optional)

---

## Apple-specific gotchas the wrapper will hit

- **Restore Purchases button** must exist and be discoverable (App Store Review Guideline 3.1.1). Added to profile.
- **Privacy + Terms links** must be visible on the paywall. Already in your routes — confirm linked from `paywall.tsx` footer.
- **Price + cadence** must be shown clearly above the CTA before purchase (already are).
- **No external payment language on iOS**: when `isNative()`, hide the "Or try for $0.99 your first month" link if it routes to Paddle — Apple rejects in-app links to web checkout for digital goods. We'll hide it on native and show it on web only.
- **Free trial wording** must match StoreKit's intro offer config. Set up "7-day free trial" as the Apple intro offer on both iOS products to match the Paddle 7-day trial.

---

## Files touched

**New**
- `src/lib/revenuecat.ts`
- `src/server/revenuecat.functions.ts`
- `src/hooks/use-entitlement.ts`

**Modified**
- `src/routes/paywall.tsx` (platform branch + entitlement check)
- `src/routes/_app/profile.tsx` (restore purchases button)
- `src/integrations/supabase/auth-middleware.ts` or login flow (call RC `logIn` on auth)
- Anywhere `useSubscription` is imported (swap to `useEntitlement`)

**Deleted**
- `src/routes/api/public/payments/webhook.ts`
- `src/hooks/use-subscription.ts`

**DB migration**
- Drop `subscriptions` table + `has_active_subscription` function

---

## Order of execution after approval

1. Wait for you to: connect Paddle in RC, create entitlement/offering, point Paddle webhook to RC, send the 3 keys.
2. I add secrets, write the new entitlement layer, branch the paywall, add Restore button.
3. I delete the old webhook + table + hook in the same pass.
4. We test: Paddle checkout in preview → RC dashboard shows entitlement → app reads it as active.
5. Once you wrap with BuildNatively, iOS path lights up automatically (same `pro_access` entitlement).

Reply when RC is set up and you have the keys.
