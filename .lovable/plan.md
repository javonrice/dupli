## What I found

The payment catalog itself looks present: monthly and yearly prices exist in both test and live, and the payment webhooks are configured.

The main UX issue is earlier in the funnel: when a signed-out user taps **Start My Free Trial** or **$0.99 first month**, the app routes to login instead of opening checkout. That can feel like “nothing payment-related is triggering,” because there is no checkout handoff after account creation/sign-in. The route also behaves inconsistently between preview and published/live URLs.

I also found these launch-risk edge cases:

1. **Signed-out checkout dead-end**
   - Anonymous user taps paywall CTA.
   - App sends them to `/login?next=/paywall`.
   - After sign-in/sign-up they return to the paywall, but checkout does not automatically resume.
   - User must understand they need to tap the CTA again. This is not native-feeling.

2. **Login page copy is misleading for checkout**
   - Login says “Sign in to save your dupes,” not “Create your account to start your trial.”
   - The user loses context that they are in a purchase flow.

3. **Preview route mismatch / 412 risk**
   - One preview host showed a top-level HTTP 412 for `/paywall`, while the stable preview/published host loads the page. This can make testing feel broken even when the route exists.
   - The fix should make testing use the stable app URL and avoid relying on an unstable sandbox host state.

4. **Intro $0.99 plan has a live-catalog mismatch**
   - The test discount exists.
   - The live discount lookup currently returns no active matching discount.
   - In live, tapping the $0.99 offer may open the full $9.99 intro price or fail discount application depending on provider behavior.

5. **Checkout errors are too generic**
   - If checkout script loading, price resolution, missing discount, or blocked popups fail, the app only says “Couldn’t start checkout.”
   - For launch, users need a recovery path: “Try again,” “Sign in again,” or “Use monthly/yearly plan.”

6. **Payment return is only partly hardened**
   - There is a 30-second post-checkout grace window, which is good.
   - But if webhooks are delayed beyond that, paying users can bounce back to paywall even after a successful checkout.

7. **Backend gating is now stronger, but environment detection has a risk**
   - The premium scan function is subscription-gated.
   - Server-side subscription checking defaults to test mode unless an environment variable is explicitly set. In live, that could reject valid live subscribers if the server environment is not aligned.

## Plan to fix the paywall payment trigger

### 1. Preserve the user’s purchase intent before login
Update the paywall CTA behavior so when a signed-out user taps a paid plan, the app stores a short-lived pending checkout intent:

- selected plan: monthly, yearly, or intro
- timestamp
- return target: `/paywall`

Then route to login with a clear `next=/paywall`.

### 2. Auto-resume checkout after sign-in/sign-up
When the user returns to `/paywall` authenticated, detect the pending checkout intent and automatically open the correct checkout once.

Guardrails:
- only resume if the intent is recent, e.g. under 15 minutes
- clear it after checkout opens or errors
- prevent duplicate checkout overlays from opening on re-render
- do not open checkout for users who already have an active subscription

### 3. Make login copy contextual for paywall
When `next=/paywall`, adjust the login screen copy only, keeping the visual style the same:

- title/subcopy should indicate account creation is needed to start the trial
- submit buttons remain the same
- no redesign

### 4. Improve checkout error handling
Add specific error handling around:

- payment script failed to load
- price not found
- discount not found
- checkout object unavailable
- unauthenticated session changed mid-flow

User-facing behavior:
- show a concise toast
- keep the CTA enabled after failure
- for intro discount failure, fall back safely or tell the user to use the main trial CTA

### 5. Fix the intro discount edge case
Decide one of these safe launch options during implementation based on provider state:

- If live discount can be created/synced through payments tooling, wire the live discount so the $0.99 CTA is real in both test and live.
- If not, hide or disable the $0.99 CTA in live until the matching discount exists, to avoid overcharging or broken checkout.

### 6. Align server-side subscription environment detection
Update the server-side subscription gate so it does not silently default to test mode in live.

Safer approach:
- infer expected environment from request host where possible
- use explicit config only if present
- fail closed with clear logs if environment cannot be determined

This protects paying live users from being denied access because the server checked the wrong subscription environment.

### 7. Add a payment-ready QA checklist
After implementation, verify these scenarios:

- Fresh anonymous user: onboarding → paywall → tap yearly → login/signup → checkout opens automatically.
- Fresh anonymous user: paywall → tap monthly → login/signup → monthly checkout opens.
- Fresh anonymous user: tap intro offer → login/signup → intro checkout opens only when discount exists.
- Returning signed-in non-paying user: `/app` redirects to paywall; CTA opens checkout immediately.
- Returning signed-in paying user: `/paywall` redirects to `/app`.
- Failed checkout load: CTA recovers and user sees a useful message.
- Successful checkout return: `/app?checkout=success` shows grace state and does not trap the user.
- Delayed webhook: app refreshes subscription state and only re-gates if no valid subscription arrives.
- Backend bypass: premium scan endpoint returns payment-required for signed-in non-paying users.
- Live mode: yearly/monthly IDs resolve; intro CTA is either correctly discounted or hidden.

## Technical notes

Files likely to change:

- `src/routes/paywall.tsx`
- `src/routes/login.tsx`
- `src/hooks/use-paddle-checkout.ts`
- `src/lib/paddle.ts`
- `src/server/subscription-middleware.ts`

No visual redesign. No weakening of the paywall. Non-paying users stay blocked from premium scans. Paying users get a cleaner path into checkout and back into the app.