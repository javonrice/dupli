import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Claim any unclaimed subscription rows whose customer_email matches the
// signed-in user's auth email. Uses a SECURITY DEFINER SQL function so the
// match is enforced server-side against auth.users (no client-supplied email).
export const claimSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ claimed: number }> => {
    const { supabase } = context as { supabase: any };
    const { data, error } = await supabase.rpc(
      "claim_subscriptions_for_current_user",
    );
    if (error) {
      console.error("[claimSubscriptions] rpc failed", error);
      return { claimed: 0 };
    }
    return { claimed: typeof data === "number" ? data : 0 };
  });

// Claim by Paddle customer id — fallback for when Paddle returns an
// anonymized relay email (e.g. Apple Hide My Email) that won't match the
// signup email. The customer id is captured in localStorage during checkout
// and passed in here.
export const claimSubscriptionsByCustomerId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { customerId: string }) => {
    if (!data || typeof data.customerId !== "string" || !data.customerId) {
      throw new Error("customerId required");
    }
    return data;
  })
  .handler(async ({ context, data }): Promise<{ claimed: number }> => {
    const { supabase } = context as { supabase: any };
    const { data: result, error } = await supabase.rpc(
      "claim_subscriptions_by_customer_id",
      { p_customer_id: data.customerId },
    );
    if (error) {
      console.error("[claimSubscriptionsByCustomerId] rpc failed", error);
      return { claimed: 0 };
    }
    return { claimed: typeof result === "number" ? result : 0 };
  });
