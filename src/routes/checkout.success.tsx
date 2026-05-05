import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getClientStripeEnv } from "@/lib/stripe-env";
import { isSubscriptionActive } from "@/lib/access";
import { markOnboardingComplete } from "@/lib/onboarding";
import { completeOnboarding, getRouteResolution } from "@/server/onboarding.functions";

export const Route = createFileRoute("/checkout/success")({
  component: CheckoutSuccessPage,
  head: () => ({ meta: [{ title: "Finalizing — Dupli" }] }),
});

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30000;

function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setStalled(false);

    let timeoutId: number | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const start = Date.now();
    const env = getClientStripeEnv();

    const finalize = async (userId: string) => {
      markOnboardingComplete();
      try {
        await completeOnboarding();
      } catch {
        /* non-fatal */
      }
      try {
        const res = await getRouteResolution();
        const dest = res.destination;
        if (dest.to === "/onboarding") {
          navigate({ to: "/onboarding", search: dest.search, replace: true });
        } else if (dest.to === "/paywall") {
          // Defensive: resolver disagrees, fall back to /app rather than
          // bouncing the user back to paywall after a successful payment.
          navigate({ to: "/app", replace: true });
        } else {
          navigate({ to: dest.to, replace: true });
        }
      } catch {
        navigate({ to: "/app", replace: true });
      }
      void userId;
    };

    const checkOnce = async (): Promise<boolean> => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) {
        navigate({ to: "/onboarding" });
        return true;
      }
      const { data: sub } = await (supabase as any)
        .from("subscriptions")
        .select("status,current_period_end")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelledRef.current) return true;
      if (isSubscriptionActive(sub)) {
        await finalize(userId);
        return true;
      }
      return false;
    };

    const tick = async () => {
      if (cancelledRef.current) return;
      const done = await checkOnce();
      if (done || cancelledRef.current) return;
      if (Date.now() - start > POLL_TIMEOUT_MS) {
        setStalled(true);
        return;
      }
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Start polling and subscribe to realtime so a webhook landing mid-poll
    // resolves immediately.
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (userId) {
        channel = supabase
          .channel(`checkout-success-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "subscriptions",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              void checkOnce();
            },
          )
          .subscribe();
      }
      tick();
    })();

    return () => {
      cancelledRef.current = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [attempt, navigate]);

  const retry = () => setAttempt((a) => a + 1);

  return (
    <div className="flex h-screen-safe flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
        <Sparkles className="h-6 w-6 text-foreground" />
      </div>
      <h1 className="mt-5 font-display text-[24px] font-bold leading-tight tracking-tight">
        {stalled ? "Almost there…" : "Finalizing your subscription…"}
      </h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
        {stalled
          ? "Your payment went through. We're still attaching your subscription. Try again in a moment."
          : "This usually takes a few seconds."}
      </p>
      {!stalled && <Loader2 className="mt-6 h-6 w-6 animate-spin text-muted-foreground" />}
      {stalled && (
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={retry}
            className="tap flex h-[52px] w-full items-center justify-center rounded-[16px] bg-foreground text-[15px] font-semibold text-background shadow-lift"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={retry}
            className="tap flex h-[44px] w-full items-center justify-center rounded-[14px] border border-border bg-card text-[14px] font-medium text-foreground"
          >
            I already paid — check again
          </button>
          <a
            href="mailto:support@trydupli.com?subject=Checkout%20stalled"
            className="tap text-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Contact support
          </a>
        </div>
      )}
    </div>
  );
}
