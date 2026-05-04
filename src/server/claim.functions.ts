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
