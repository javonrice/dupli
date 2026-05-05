## Migrate payments to Stripe + update pricing model

Two changes in one pass:
1. Switch the payments integration from Paddle to Lovable's built-in Stripe.
2. Update pricing to match the uploaded mockup: **$49.99/year** (Best Value, 5-day free trial) and **$7.99/month** (5-day free trial). The $0.99 intro offer is removed.

All existing behavior is preserved: free 3-scans/day quota, super user bypass, paywall UX, customer portal, onboarding flow.

---

### New pricing model

| Plan    | Price       | Trial         | Notes                              |
|---------|-------------|---------------|------------------------------------|
| Yearly  | $49.99/year | 5-day free    | Best Value · "Just $4.17/mo · Save 48%" |
| Monthly | $7.99/month | 5-day free    | —                                  |

- Crossed-out comparison price `$95.88` (12 × $7.99) shown on the yearly card.
- "Save 48%" badge (computed from $49.99 vs $95.88).
- The intro `$0.99 first month` offer is removed entirely (button + Stripe coupon + price).

### Stripe integration

**Backend / infra**
1. Enable Lovable's built-in Stripe integration. This auto-provisions `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` and registers the webhook.
2. Create Stripe products + prices in test (auto-synced to live on publish), reusing the same human-readable IDs the rest of the app already references:
   - `dupli_pro_yearly` → $49.99/year, 5-day trial
   - `dupli_pro_monthly` → $7.99/month, 5-day trial
3. Replace `src/lib/paddle.server.ts` with `src/lib/stripe.server.ts` (Stripe SDK client + `verifyWebhook` using `STRIPE_WEBHOOK_SECRET`).
4. Replace `src/routes/api/public/payments/webhook.ts` to handle Stripe events:
   - `checkout.session.completed` → upsert subscription (read `metadata.userId`)
   - `customer.subscription.created/updated/deleted` → update status, period, cancel_at_period_end
   - Verify with `stripe.webhooks.constructEvent`.
5. Replace `src/server/payments.functions.ts`:
   - `resolveStripePrice({ priceId })` — looks up Stripe Price by `lookup_key`.
   - New `createCheckoutSession({ priceId, userId, email })` — creates a Stripe Checkout Session (subscription mode, 5-day trial, success URL `/checkout/success`, cancel URL `/paywall`) and returns the URL.
6. Replace `src/server/billing.functions.ts` `createCustomerPortalSession` to call `stripe.billingPortal.sessions.create`.

**Database**
- Migration: rename `paddle_subscription_id` → `stripe_subscription_id`, `paddle_customer_id` → `stripe_customer_id` (same string columns, repurposed). The `environment` column still gates `'sandbox'` vs `'live'`. `has_active_subscription()` is unchanged. RLS unchanged.

**Frontend**
7. Replace `src/lib/paddle.ts` → `src/lib/stripe.ts` — `getStripeEnvironment()` (derived from `pk_test_` vs `pk_live_` prefix) + `redirectToCheckout(priceId)` helper that calls the server function and does `window.location.href = url`.
8. Replace `src/hooks/use-paddle-checkout.ts` → `src/hooks/use-stripe-checkout.ts` with the same `{ openCheckout, loading }` shape.
9. Update `src/routes/paywall.tsx`:
   - Swap to the new hook + helpers.
   - Remove the "Or try for $0.99 your first month" button and `startCheap` flow.
   - Update plan cards to the new prices ($49.99/year and $7.99/month).
   - Yearly card: show crossed-out `$95.88`, "Save 48%" badge, and "Just $4.17/mo · 5-day free trial" subline.
   - Monthly card: "$7.99/month · 5-day free trial".
   - Update `<TrialTimeline>` to "5-day free trial" and the new prices.
   - Update CTA: "Start My Free Trial" → "Then $49.99/year" or "Then $7.99/month" depending on plan.
   - Footer microcopy: "Try free for 5 days. Cancel anytime. No risk."
10. Update `src/components/onboarding/trial-timeline.tsx` for 5-day trial wording.
11. Update `src/hooks/use-subscription.ts` env detection to use `getStripeEnvironment()` (super user bypass preserved).
12. Update `src/components/payment-test-mode-banner.tsx` to read the Stripe env helper.
13. Update `.env.development` / `.env.production` — add `VITE_STRIPE_PUBLISHABLE_KEY`, remove `VITE_PAYMENTS_CLIENT_TOKEN` and `PADDLE_ENVIRONMENT`. Update `wrangler.jsonc` vars.

**Cleanup**
14. Remove `@paddle/paddle-node-sdk`. Delete obsolete Paddle helpers and the `resolvePaddleDiscount` function.

### What stays the same
- `subscriptions` table schema (only column names renamed), RLS, `has_active_subscription`.
- `requireScanEntitlement` middleware (3 scans/day for free users).
- `SUPER_USER_IDS` hardcoded bypass.
- Paywall layout, plan toggle, "Maybe later" flow, quota banner.
- `useSubscription` hook contract (`isActive`, `loading`).
- Onboarding routing in `_app.tsx`, `/checkout/success` page.

### Differences user will notice
- Checkout opens as a **hosted Stripe Checkout page** (full redirect) instead of the Paddle overlay. This is the standard Lovable Stripe flow and is more reliable on iOS/PWA.
- Customer portal still opens in a new tab.
- Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

### Note on the visual style of the mockup
The uploaded image shows a dark theme with a gradient CTA and green "Best Value" ribbon. Your current paywall uses a light/neutral theme with a black CTA. I will keep the **content/structure** from the mockup (prices, trial length, save % badge, crossed-out price) but keep the existing visual styling consistent with the rest of the app. If you want me to also restyle to match the dark gradient mockup, say so and I'll do that as a follow-up.

After approval I'll implement everything in one pass.
