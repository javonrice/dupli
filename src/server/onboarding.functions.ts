import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getServerPaddleEnv(): "sandbox" | "live" {
  const explicit = process.env.PADDLE_ENVIRONMENT;
  if (explicit === "live" || explicit === "sandbox") return explicit;
  return process.env.NODE_ENV === "production" ? "live" : "sandbox";
}

export const getRouteResolution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ hasActiveSub: boolean; onboardingCompleted: boolean }> => {
      const userId = (context as { userId: string }).userId;
      const env = getServerPaddleEnv();

      const [profileRes, subRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("onboarding_completed")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("status,current_period_end")
          .eq("user_id", userId)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const sub = subRes.data;
      const now = Date.now();
      const periodEnd = sub?.current_period_end
        ? new Date(sub.current_period_end).getTime()
        : null;
      const hasActiveSub =
        !!sub?.status &&
        ((["active", "trialing", "past_due"].includes(sub.status) &&
          (periodEnd === null || periodEnd > now)) ||
          (sub.status === "canceled" && periodEnd !== null && periodEnd > now));

      return {
        hasActiveSub,
        onboardingCompleted:
          (profileRes.data as { onboarding_completed?: boolean } | null)
            ?.onboarding_completed === true,
      };
    },
  );

export const saveOnboardingAnswers = createServerFn({ method: "POST" })
  .inputValidator((data: { answers: Record<string, unknown> }) => data)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const userId = (context as { userId: string }).userId;
    await supabaseAdmin
      .from("profiles")
      .update({ onboarding_answers: data.answers as never })
      .eq("user_id", userId);
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const userId = (context as { userId: string }).userId;
    await supabaseAdmin
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("user_id", userId);
    return { ok: true };
  });
