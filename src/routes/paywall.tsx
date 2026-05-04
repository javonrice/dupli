import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { markOnboardingComplete, track } from "@/lib/onboarding";
import { TrialTimeline } from "@/components/onboarding/trial-timeline";
import { useAuth } from "@/hooks/use-auth";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { getPaddleDiscountId } from "@/lib/paddle";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/paywall")({
  component: PaywallPage,
  // NOTE: auth + subscription checks happen client-side in the component.
  // Running them in beforeLoad executes on the server (no localStorage/session
  // cookies in this setup), which always redirects fresh visitors to /login —
  // not native-app behavior.
  head: () => ({
    meta: [
      { title: "Go Premium — Dupli" },
      { name: "description", content: "Unlock unlimited scans and full dupe comparisons." },
    ],
  }),
});

const BENEFITS = [
  "Unlimited beauty scans",
  "Full match breakdowns",
  "Save your favorite dupes",
  "Notifications when better matches appear",
];

const PRICE_IDS = {
  yearly: "dupli_pro_yearly",
  monthly: "dupli_pro_monthly",
  intro: "dupli_pro_intro_monthly",
} as const;

const INTRO_DISCOUNT_DESCRIPTION = "Dupli Intro - $0.99 first month";

type Plan = "yearly" | "monthly";

function PaywallPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [introLoading, setIntroLoading] = useState(false);
  const [plan, setPlan] = useState<Plan>("yearly");

  useEffect(() => {
    track("paywall_viewed_after_result");
  }, []);

  const requireUser = (): string | null => {
    if (!user) {
      toast.error("Please sign in to start a trial.");
      navigate({ to: "/login" });
      return null;
    }
    return user.id;
  };

  const startTrial = async () => {
    const userId = requireUser();
    if (!userId) return;
    track("trial_started", { plan });
    try {
      await openCheckout({
        priceId: PRICE_IDS[plan],
        customerEmail: user?.email,
        customData: { userId },
        successUrl: `${window.location.origin}/app?checkout=success`,
      });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't start checkout. Please try again.");
    }
  };

  const startCheap = async () => {
    const userId = requireUser();
    if (!userId) return;
    track("trial_started", { plan: "intro_99c" });
    setIntroLoading(true);
    try {
      const discountId = await getPaddleDiscountId(INTRO_DISCOUNT_DESCRIPTION);
      await openCheckout({
        priceId: PRICE_IDS.intro,
        discountId,
        customerEmail: user?.email,
        customData: { userId },
        successUrl: `${window.location.origin}/app?checkout=success`,
      });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't start checkout. Please try again.");
    } finally {
      setIntroLoading(false);
    }
  };

  const dismiss = () => {
    track("paywall_dismissed");
    markOnboardingComplete();
    navigate({ to: "/app" });
  };

  const busy = checkoutLoading || introLoading;

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex h-12 items-center justify-end px-3">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="tap flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          7-day free trial
        </p>
        <h1 className="mt-2 text-center font-display text-[30px] font-bold leading-[1.1] tracking-tight">
          Start finding cheaper beauty today.
        </h1>

        <div className="mt-6">
          <TrialTimeline
            price={plan === "yearly" ? "$39.99" : "$9.99"}
            cadence={plan === "yearly" ? "year" : "month"}
          />
        </div>

        <ul className="mt-6 space-y-1.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-3 px-1 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-foreground">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-[14px] font-medium text-foreground">{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <PlanCard
            active={plan === "monthly"}
            onClick={() => {
              setPlan("monthly");
              track("paywall_plan_toggled", { plan: "monthly" });
            }}
            title="Monthly"
            price="$9.99"
            sub="per month"
          />
          <PlanCard
            active={plan === "yearly"}
            onClick={() => {
              setPlan("yearly");
              track("paywall_plan_toggled", { plan: "yearly" });
            }}
            title="Yearly"
            price="$39.99"
            sub="$3.33 / mo"
            badge="Save 67%"
          />
        </div>
      </div>

      <div className="pb-safe space-y-2 px-6 pt-3">
        <button
          type="button"
          onClick={startTrial}
          disabled={busy}
          className="tap flex h-[58px] w-full flex-col items-center justify-center rounded-[16px] bg-foreground text-background shadow-lift disabled:opacity-60"
        >
          {checkoutLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span className="text-[15px] font-semibold">Start My Free Trial</span>
              <span className="text-[11px] opacity-80">
                7 days free, then {plan === "yearly" ? "$39.99/year" : "$9.99/month"} · cancel anytime
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={startCheap}
          disabled={busy}
          className="tap w-full text-center text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
        >
          {introLoading ? "Opening checkout…" : "Or try for $0.99 your first month"}
        </button>
      </div>
    </div>
  );
}

function PlanCard({
  active,
  onClick,
  title,
  price,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap relative flex flex-col items-start rounded-[16px] border p-4 text-left transition-all active:scale-[0.985] ${
        active
          ? "border-foreground bg-foreground text-background shadow-lift"
          : "border-border bg-card text-foreground"
      }`}
    >
      {badge && (
        <span
          className={`absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            active ? "bg-background text-foreground" : "bg-foreground text-background"
          }`}
        >
          {badge}
        </span>
      )}
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-80">
        {title}
      </span>
      <span className="mt-1 font-display text-[22px] font-bold tracking-tight">{price}</span>
      <span className={`text-[12px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
        {sub}
      </span>
    </button>
  );
}
