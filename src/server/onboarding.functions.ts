import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Best-effort per-IP rate limit. Workers are multi-instance so this is not a
// hard guarantee — it just blunts trivial enumeration attempts. The endpoint
// always returns only { exists: boolean } so it leaks no PII either way.
const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_BUCKET.get(ip);
  if (!entry || entry.resetAt < now) {
    RATE_BUCKET.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const checkEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkEmailSchema.parse(input))
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    try {
      const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
      if (rateLimited(ip)) return { exists: false };

      const { data: row } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .limit(1)
        .maybeSingle();

      return { exists: !!row };
    } catch {
      // Fail-open into signup; password screen has a duplicate-user fallback.
      return { exists: false };
    }
  });

function getServerStripeEnv(): "sandbox" | "live" {
  return process.env.NODE_ENV === "production" ? "live" : "sandbox";
}

export const getRouteResolution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ hasActiveSub: boolean; onboardingCompleted: boolean }> => {
      const userId = (context as { userId: string }).userId;
      const env = getServerStripeEnv();

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
