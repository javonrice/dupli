// Middleware that requires an authenticated user with an active subscription.
// Builds on requireSupabaseAuth and additionally checks the subscriptions
// table (matching the current Paddle environment) before allowing the
// handler to run. Returns HTTP 402 (Payment Required) when no active
// subscription is found so the client can route the user to /paywall.

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getServerPaddleEnv(): "sandbox" | "live" {
  // Mirror the client-side getPaddleEnvironment(): live only when a published
  // production hostname is in play. On the server we don't have window, so we
  // fall back to an explicit env var or default to sandbox for safety.
  const explicit = process.env.PADDLE_ENVIRONMENT;
  if (explicit === "live" || explicit === "sandbox") return explicit;
  return "sandbox";
}

export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as { userId: string }).userId;
    const env = getServerPaddleEnv();

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

    const now = Date.now();
    const periodEnd = data?.current_period_end ? new Date(data.current_period_end).getTime() : null;
    const status = data?.status;
    const isActive =
      !!status &&
      ((["active", "trialing", "past_due"].includes(status) &&
        (periodEnd === null || periodEnd > now)) ||
        (status === "canceled" && periodEnd !== null && periodEnd > now));

    if (!isActive) {
      throw new Response("Payment Required: active subscription needed", { status: 402 });
    }

    return next({ context });
  });
