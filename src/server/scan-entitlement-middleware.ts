// Gate the scanProduct server function on either an active subscription OR
// remaining free-tier quota (3 successful scans per UTC day).
//
// On quota exhaustion, throws HTTP 402 with a JSON body so the client can
// route to /paywall with a quota-aware message and disable the scan button
// until the next UTC midnight.

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSuperUser } from "@/lib/superusers";

const FREE_DAILY_LIMIT = 3;

function getServerPaddleEnv(): "sandbox" | "live" {
  const explicit = process.env.PADDLE_ENVIRONMENT;
  if (explicit === "live" || explicit === "sandbox") return explicit;
  return process.env.NODE_ENV === "production" ? "live" : "sandbox";
}

function nextUtcMidnightISO(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.toISOString();
}

function startOfUtcDayISO(): string {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return start.toISOString();
}

export const requireScanEntitlement = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as { userId: string }).userId;
    const env = getServerPaddleEnv();

    // 1. Active subscription always passes.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status,current_period_end")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : null;
    const status = sub?.status;
    const isActive =
      !!status &&
      ((["active", "trialing", "past_due"].includes(status) &&
        (periodEnd === null || periodEnd > now)) ||
        (status === "canceled" && periodEnd !== null && periodEnd > now));

    if (isActive) return next({ context });

    // 2. Free tier: count successful scans in the current UTC day.
    const since = startOfUtcDayISO();
    const { count, error: countError } = await supabaseAdmin
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (countError) {
      console.error("[requireScanEntitlement] scan count failed", countError);
      throw new Response("Scan quota lookup failed", { status: 500 });
    }

    if ((count ?? 0) >= FREE_DAILY_LIMIT) {
      const body = JSON.stringify({
        reason: "quota",
        limit: FREE_DAILY_LIMIT,
        resetAt: nextUtcMidnightISO(),
      });
      throw new Response(body, {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }

    return next({ context });
  });
