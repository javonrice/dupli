## Goal

Remove the daily free-scan quota and "Maybe later — keep browsing" escape hatch from the paywall. Hard paywall is the only access model: subscribers + superusers scan freely; everyone else hits /paywall.

## Changes

### 1. `src/server/scan-entitlement-middleware.ts`
Strip free-tier counting. Allow only superuser or active subscription; otherwise throw 402 with `{ reason: "subscription_required" }`. Remove `FREE_DAILY_LIMIT`, UTC midnight helpers, and the `scans` table count query.

### 2. `src/lib/scan-quota.ts`
Delete the file (no longer used).

### 3. `src/lib/use-scan-flow.ts`
- Remove `import { setScanBlocked }` and the `setScanBlocked(...)` call inside the 402 branch.
- On 402, just `navigate({ to: "/paywall" })`.

### 4. `src/components/home/scan-fab.tsx`
- Remove `readScanBlock`/`formatResetCountdown` imports, `block` state, the polling `useEffect`, the `Lock` icon branch, and the "Resets in …" badge.
- FAB always opens the capture sheet for users in `/_app` (they're already paid by the `_app` gate). Drop the `useSubscription` import if no longer needed.

### 5. `src/routes/paywall.tsx`
- Remove imports from `@/lib/scan-quota`.
- Remove `quotaReason` state, the effect that reads it, and the quota banner JSX (lines 203–212).
- Remove the "Maybe later — keep browsing" button (lines 274–282).
- Remove the `clearPaywallReason()` call from `handleClose` (and remove `handleClose` if now unused — it's still referenced by the X close button, so keep it but simplify).

### 6. Verification searches
After edits, `rg "scan-quota|blockedUntil|paywall.reason|FREE_DAILY|free scan|Maybe later — keep browsing|3 free scans"` in `src/` should return nothing (the unrelated "Maybe later" in `onboarding.index.tsx` notifications step stays — different feature).

## Out of scope
No pricing, checkout, onboarding, UI redesign, or `_app` gate changes. The `_app` resolver already routes unpaid users away.
