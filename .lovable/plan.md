# Wire paywall to Paddle

Paddle is enabled. Three test products + discount already created:
- `dupli_pro_yearly` — $39.99/yr, 7-day trial
- `dupli_pro_monthly` — $9.99/mo, 7-day trial
- `dupli_pro_intro_monthly` — $9.99/mo, with `Dupli Intro - $0.99 first month` flat $9 discount restricted to it (charges $0.99 first month, $9.99 after)

## 1. Database migration — `subscriptions` table
- `subscriptions` (id, user_id→auth.users, paddle_subscription_id unique, paddle_customer_id, product_id, price_id, status, current_period_start/end, cancel_at_period_end, environment, timestamps)
- Indexes on user_id and paddle_subscription_id
- RLS: users SELECT own; service_role ALL
- `set_updated_at` trigger
- `has_active_subscription(uuid, env)` helper, defaults env='live'

## 2. Server utilities (Paddle SDK already installed)
- `src/lib/paddle.server.ts` — `getPaddleClient`, `gatewayFetch`, `verifyWebhook`, `EventName`, `PaddleEnv` (canonical shape from knowledge)
- `src/server/payments.functions.ts` — `resolvePaddlePrice` + `resolvePaddleDiscount` server functions
- `src/lib/paddle.ts` — client: `getPaddleEnvironment`, `initializePaddle`, `getPaddlePriceId`, `getPaddleDiscountId`

## 3. Webhook handler
- `src/routes/api/public/payments/webhook.ts` (exact path required) — handles `subscription.created/updated/canceled`, upserts on `paddle_subscription_id`, filters by `environment` on updates

## 4. Subscription hook + test-mode banner
- `src/hooks/use-subscription.ts` — reads current user's row filtered by env, derives `isActive`, listens for realtime updates
- `src/components/payment-test-mode-banner.tsx` — orange strip when client token is `test_`
- Mount banner at top of `__root.tsx` shell

## 5. Wire paywall buttons (`src/routes/paywall.tsx`)
Replace `startTrial` and `startCheap`:
```ts
const { openCheckout } = usePaddleCheckout(); // new hook
// Yearly/Monthly trial button:
openCheckout({
  priceId: plan === "yearly" ? "dupli_pro_yearly" : "dupli_pro_monthly",
  customerEmail: user?.email,
  customData: { userId: user!.id },
  successUrl: `${origin}/app?checkout=success`,
});
// Intro $0.99:
const discountId = await getPaddleDiscountId("Dupli Intro - $0.99 first month");
openCheckout({
  priceId: "dupli_pro_intro_monthly",
  discountId,
  customerEmail: user?.email,
  customData: { userId: user!.id },
  successUrl: `${origin}/app?checkout=success`,
});
```
- Add `src/hooks/use-paddle-checkout.ts` wrapping `Paddle.Checkout.open` (overlay mode)
- Require auth: if `!user`, route to `/login?next=/paywall` first (so we always have userId for `customData`)
- Remove `markOnboardingComplete()` from click handlers — now driven by `?checkout=success`

## 6. Post-checkout return
- In `src/routes/_app/app.tsx`: on mount, if `?checkout=success`, call `markOnboardingComplete()`, toast "Welcome to Pro 🎉", strip the query param

## 7. Paywall dismiss
- "X" close still calls `markOnboardingComplete()` + routes to `/app` (free tier; gated by `useSubscription` later)

## Files
**New**: migration, `src/lib/paddle.server.ts`, `src/lib/paddle.ts`, `src/server/payments.functions.ts`, `src/components/payment-test-mode-banner.tsx`, `src/routes/api/public/payments/webhook.ts`, `src/hooks/use-subscription.ts`, `src/hooks/use-paddle-checkout.ts`

**Edited**: `src/routes/paywall.tsx`, `src/routes/_app/app.tsx`, `src/routes/__root.tsx`

After approval I'll implement all of this in one pass and you can test with a Paddle test card in the preview.