// Middleware that requires an authenticated user with an active subscription.
// Builds on requireSupabaseAuth and additionally checks the subscriptions
// table (matching the current Stripe environment) before allowing the
// handler to run. Returns HTTP 402 (Payment Required) when no active
// subscription is found so the client can route the user to /paywall.

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getServerStripeEnv } from "@/lib/stripe-env.server";
import { isSubscriptionActive } from "@/lib/access";
import { isSuperUser } from "@/lib/superusers";

export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as { userId: string }).userId;

    // Superuser bypass — must match getRouteResolution and useSubscription.
    if (isSuperUser(userId)) return next({ context });

    const env = getServerStripeEnv();
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status,current_period_end,environment")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[requireActiveSubscription] subscription lookup failed", error);
      throw new Response("Subscription lookup failed", { status: 500 });
    }

    if (!isSubscriptionActive(data)) {
      throw new Response("Payment Required: active subscription needed", { status: 402 });
    }

    return next({ context });
  });
