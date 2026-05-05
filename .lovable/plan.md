# Free tier: 3 scans/day with paywall fallback

Open up `/app` to unpaid users so they can browse and scan, but cap them at **3 successful scans per day** (UTC). On the 4th attempt, route them to the paywall. If they decline the paywall they keep full browse access but cannot scan again until midnight UTC, when their daily quota resets.

## Changes

### 1. `src/routes/_app.tsx` — stop bouncing unpaid users

Replace the unpaid → `/paywall` redirect with: only redirect when the user hasn't finished onboarding. Otherwise let unpaid users into the app.

```text
if (!user)                              → /onboarding/email
if (!isActive && !onboardingCompleted)  → /onboarding?start=quiz
otherwise                               → render app
```

The `/paywall` route stays available for upsell from the scanner and any "go premium" CTA. A "Maybe later" / back button on `/paywall` returns the user to `/app` (browse-only mode).

### 2. New middleware `requireScanEntitlement` on `scanProduct`

File: `src/server/scan-entitlement-middleware.ts`

- Run `requireSupabaseAuth` first (need `userId`).
- Look up active subscription. If active → `next()`.
- Else count `scans` rows for `user_id = userId` where `created_at >= date_trunc('day', now() at time zone 'UTC')`.
- If `count >= 3` → `throw new Response(JSON.stringify({ reason: "quota", resetAt: <next UTC midnight ISO> }), { status: 402, headers: { "content-type": "application/json" } })`.
- Else → `next()`.

Wire it up in `src/server/scan.functions.ts`: replace `.middleware([requireActiveSubscription])` with `.middleware([requireScanEntitlement])` on `scanProduct`.

### 3. Scanner client handles 402 → paywall with quota reason

`src/lib/use-scan-flow.ts`: on 402, parse the body, write `sessionStorage["dupli.paywall.reason"] = "quota"` and `sessionStorage["dupli.paywall.resetAt"] = resetAt`, then `navigate({ to: "/paywall" })`.

### 4. `src/routes/paywall.tsx` — quota state + "Maybe later"

- On mount, read the sessionStorage flags. If `reason === "quota"`, show a banner above the headline:
  > "You've used your 3 free scans for today. They reset in `<countdown to resetAt>`."
- Add / surface a "Maybe later" button that navigates back to `/app`. Browsing (history, saved scans, trending, search) keeps working — only the scan action is blocked.

### 5. Browse-only UX in `/app` for the rest of today

When the scanner attempts a scan and the server returns 402, in addition to the paywall redirect, store `sessionStorage["dupli.scan.blockedUntil"] = resetAt`. The scan FAB / Scan button in `src/routes/_app.tsx` (and any other entry points like the Discovery Hub FAB) reads this on mount:

- If `blockedUntil` is in the future and the user is unpaid, the scan button:
  - stays visible but tapping it routes to `/paywall` instead of opening the camera, and
  - shows a small "Resets in `<countdown>`" hint underneath.
- If `blockedUntil` has passed, clear the key and restore normal scan behavior.
- Paid users ignore the flag entirely.

This means a user who hits the cap, declines the paywall, and comes back to `/app` can keep browsing all day but cannot trigger a scan until the next UTC midnight.

## What does NOT change

- Paid users: unchanged.
- Onboarding flow: unchanged.
- Scan persistence (`saveScan`) — unchanged. Quota counts persisted scans, so failed AI calls don't burn quota.
- `requireActiveSubscription` middleware stays in place for any future premium-only endpoints.

## Edge cases

- **Race / concurrent scans**: count happens before the AI call; in the rare race two scans both pass at count=2, the user gets a 4th. Acceptable.
- **Timezone**: window is UTC midnight, documented in the middleware comment.
- **Stale sessionStorage**: `blockedUntil` is checked against `Date.now()`; if it's in the past it's cleared and scanning works again immediately.

## Verification

1. Unpaid onboarded user → lands on `/app` (not paywall).
2. Run 3 scans → all succeed.
3. 4th scan → redirected to `/paywall` with "3 free scans used, resets in Xh Ym" banner.
4. Tap "Maybe later" → back on `/app`, can browse history/trending/saved, but the scan button routes to `/paywall` until UTC midnight.
5. After UTC midnight (or by clearing sessionStorage) → scanning works again.
6. Paid user → unlimited scans, no banner, no block.
