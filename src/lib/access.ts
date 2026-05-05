// Centralized subscription access predicate. Single source of truth used by:
//   - useSubscription (client)
//   - getRouteResolution (server)
//   - requireActiveSubscription (server middleware)
//   - requireScanEntitlement (server middleware)
//   - checkout.success.tsx (client)
//
// Decision: past_due grants access (Stripe dunning grace). The SQL function
// public.has_active_subscription is aligned to match.

export type SubLike =
  | { status?: string | null; current_period_end?: string | null }
  | null
  | undefined;

export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;

export function isSubscriptionActive(sub: SubLike, nowMs: number = Date.now()): boolean {
  if (!sub?.status) return false;
  const end = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : null;
  const future = end === null || end > nowMs;
  if ((ACTIVE_STATUSES as readonly string[]).includes(sub.status) && future) return true;
  if (sub.status === "canceled" && end !== null && end > nowMs) return true;
  return false;
}
