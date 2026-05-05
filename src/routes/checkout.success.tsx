import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { markOnboardingComplete } from "@/lib/onboarding";
import { completeOnboarding } from "@/server/onboarding.functions";

export const Route = createFileRoute("/checkout/success")({
  component: CheckoutSuccessPage,
  head: () => ({
    meta: [{ title: "Finalizing — Dupli" }],
  }),
});

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 10000;

function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setStalled(false);

    let timeoutId: number | undefined;
    const start = Date.now();
    const env = getPaddleEnvironment();

    const tick = async () => {
      if (cancelledRef.current) return;
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) {
        navigate({ to: "/onboarding/email" });
        return;
      }
      const { data: sub } = await (supabase as any)
        .from("subscriptions")
        .select("status,current_period_end")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelledRef.current) return;

      const status = sub?.status;
      const periodEnd = sub?.current_period_end
        ? new Date(sub.current_period_end).getTime()
        : null;
      const isActive =
        !!status &&
        ((["active", "trialing", "past_due"].includes(status) &&
          (periodEnd === null || periodEnd > Date.now())) ||
          (status === "canceled" && periodEnd !== null && periodEnd > Date.now()));

      if (isActive) {
        markOnboardingComplete();
        try {
          await completeOnboarding();
        } catch {
          /* non-fatal */
        }
        navigate({ to: "/app", replace: true });
        return;
      }

      if (Date.now() - start > POLL_TIMEOUT_MS) {
        setStalled(true);
        return;
      }
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelledRef.current = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [attempt, navigate]);

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
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="tap mt-6 flex h-[52px] w-full max-w-xs items-center justify-center rounded-[16px] bg-foreground text-[15px] font-semibold text-background shadow-lift"
        >
          Retry
        </button>
      )}
    </div>
  );
}
