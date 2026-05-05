// Hard paywall: only active subscribers (or superusers) may scan. There is
// no free-tier quota. On failure, throws HTTP 402 so the client can route
// to /paywall.

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSuperUser } from "@/lib/superusers";
import { getServerStripeEnv } from "@/lib/stripe-env.server";
import { isSubscriptionActive } from "@/lib/access";

export const requireScanEntitlement = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as { userId: string }).userId;

    if (isSuperUser(userId)) return next({ context });

    const env = getServerStripeEnv();
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status,current_period_end")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isSubscriptionActive(sub)) return next({ context });

    throw new Response(
      JSON.stringify({ reason: "subscription_required" }),
      { status: 402, headers: { "content-type": "application/json" } },
    );
  });
