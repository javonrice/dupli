I understand. The current code still blocks anonymous users at the paywall CTA and redirects them to login first. That is the exact behavior you do not want.

Plan to fix it:

1. Change the paywall CTA behavior
   - Remove the `if (!user) navigate('/login')` branch from the free trial and $0.99 offer buttons.
   - A product click will always attempt to open Paddle checkout first, whether the visitor is signed in or not.
   - For anonymous visitors, checkout will be opened without `customData.userId` and without forcing the auth screen first.

2. Route successful checkout to account creation
   - Change checkout success URLs from `/app?checkout=success` to a new post-checkout account route, e.g. `/checkout/account`.
   - After payment, the user lands on account creation/sign-in so they can claim access.
   - The login/auth screen becomes after-payment, not before-payment.

3. Add a checkout-account claim screen
   - Create a new route shown after successful checkout.
   - It will tell the user: payment/trial started, now create or sign in to activate Dupli on this device.
   - It will use the existing email/password auth UI pattern, but with checkout-specific copy.
   - If the user is already signed in, it will skip straight to `/app`.

4. Link anonymous purchases to the account safely
   - Update webhook handling so it can store a paid subscription even when `customData.userId` is missing.
   - Add a safe “claim” mechanism after signup/sign-in by matching verified payment customer data to the authenticated user.
   - Do not grant access just because someone types an email; the server will verify through the payment provider/customer/subscription data before assigning the subscription to the logged-in user.

5. Keep signed-in checkout working
   - If a signed-in user clicks a product, continue passing `customData.userId` so their subscription attaches immediately through the webhook.
   - Their success URL can still go directly to `/app?checkout=success`.

6. Fix edge cases around the new flow
   - Anonymous user closes checkout: remains on paywall, no login redirect.
   - Anonymous user completes checkout but webhook is delayed: show a short activation/loading grace state and retry claiming.
   - Anonymous user uses a different email at account creation than checkout: show a clear message asking them to use the checkout email or sign in with the account tied to that purchase.
   - Signed-in but unsubscribed user: checkout opens immediately and grants access after success.
   - Intro discount unavailable: do not silently charge full price; show a clear error.

Technical details:
- Files to update/create:
  - `src/routes/paywall.tsx`
  - `src/hooks/use-paddle-checkout.ts` if needed for cleaner anonymous checkout options
  - `src/routes/checkout.account.tsx` or equivalent TanStack route file
  - `src/routes/api/public/payments/webhook.ts`
  - a server function for claiming anonymous payment subscriptions after auth
  - database migration if needed to allow temporary unclaimed subscriptions or a pending checkout/customer mapping

The end result: after onboarding, the paywall appears; tapping Monthly, Yearly, Free Trial, or $0.99 opens checkout first. The user only sees account creation after completing checkout, not before.