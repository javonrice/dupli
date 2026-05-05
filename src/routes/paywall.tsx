import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { track } from "@/lib/onboarding";
import { TrialTimeline } from "@/components/onboarding/trial-timeline";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useStripeCheckout } from "@/hooks/use-stripe-checkout";
import { supabase } from "@/integrations/supabase/client";
import { getRouteResolution } from "@/server/onboarding.functions";
import {
  readPaywallReason,
  readScanBlock,
  formatResetCountdown,
  clearPaywallReason,
} from "@/lib/scan-quota";

export const Route = createFileRoute("/paywall")({
  component: PaywallPage,
  beforeLoad: async () => {
    // Skip during SSR — the browser supabase client owns the session and
    // localStorage isn't available server-side. The component-level effects
    // still gate rendering on the client when needed.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/onboarding" });
    }
    try {
      const res = await getRouteResolution();
      if (res.destination.to !== "/paywall") {
        const dest = res.destination;
        if (dest.to === "/onboarding") {
          throw redirect({ to: "/onboarding", search: dest.search });
        }
        throw redirect({ to: dest.to });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      // Resolver failure: render paywall as the safe fallback.
    }
  },
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
} as const;

type Plan = "yearly" | "monthly";

function PaywallPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const [quotaReason, setQuotaReason] = useState<{ resetAt: string } | null>(null);
  // Client-side resolver gate: beforeLoad is a no-op during SSR, so on direct
  // hydrated loads we must re-verify destination=/paywall before rendering
  // any paywall content. Prevents anonymous/paid users from briefly seeing
  // the paywall.
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          navigate({ to: "/onboarding", replace: true });
          return;
        }
        const res = await getRouteResolution();
        if (cancelled) return;
        const dest = res.destination;
        if (dest.to === "/paywall") {
          setVerified(true);
        } else if (dest.to === "/onboarding") {
          navigate({ to: "/onboarding", search: dest.search, replace: true });
        } else {
          navigate({ to: dest.to, replace: true });
        }
      } catch {
        if (!cancelled) setVerified(true); // safe fallback: render paywall
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  const [plan, setPlan] = useState<Plan>(() => {
    if (typeof window === "undefined") return "yearly";
    try {
      const saved = window.sessionStorage.getItem("dupli.paywall.plan");
      return saved === "monthly" || saved === "yearly" ? saved : "yearly";
    } catch {
      return "yearly";
    }
  });

  useEffect(() => {
    if (readPaywallReason() === "quota") {
      const block = readScanBlock();
      if (block.resetAt) setQuotaReason({ resetAt: block.resetAt });
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("dupli.paywall.plan", plan);
    } catch {
      /* ignore */
    }
  }, [plan]);

  useEffect(() => {
    track("paywall_viewed_after_result");
  }, []);

  // Defensive: if subscription becomes active while the user is on the
  // paywall (e.g. webhook lands during checkout), bounce to /app. Anonymous
  // and already-paid sessions are caught by beforeLoad before render.
  useEffect(() => {
    if (!authLoading && !subLoading && user && isActive) {
      navigate({ to: "/app", replace: true });
    }
  }, [authLoading, subLoading, user, isActive, navigate]);

  const startTrial = () => {
    if (!user) return;
    track("trial_started", { plan });
    openCheckout({
      priceId: PRICE_IDS[plan],
      customerEmail: user.email,
      userId: user.id,
      returnUrl: `${window.location.origin}/checkout/success`,
    });
  };

  const handleClose = () => {
    clearPaywallReason();
    if (user) navigate({ to: "/app" });
    else navigate({ to: "/onboarding" });
  };

  if (authLoading || subLoading || !verified) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isOpen) {
    return (
      <div className="flex min-h-screen-safe flex-col bg-background">
        <div className="pt-safe" />
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <button
            type="button"
            onClick={closeCheckout}
            className="tap text-[14px] font-semibold text-foreground"
          >
            ← Back
          </button>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Secure checkout
          </span>
          <span className="w-8" />
        </div>
        <div className="flex-1 px-2 pb-safe">{checkoutElement}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex items-center justify-end px-4 pt-2 pb-1">
        <button
          type="button"
          onClick={handleClose}
          className="tap -mr-2 flex h-9 w-9 items-center justify-center rounded-full text-foreground"
          aria-label="Close"
        >
          <X className="h-6 w-6" strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {quotaReason && (
          <div className="mb-4 rounded-[14px] border border-border bg-secondary px-4 py-3 text-center">
            <p className="text-[13px] font-semibold text-foreground">
              You've used your 3 free scans for today.
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              They reset in {formatResetCountdown(quotaReason.resetAt)}. Go Premium for unlimited scans.
            </p>
          </div>
        )}
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          5-day free trial
        </p>
        <h1 className="mt-2 text-center font-display text-[30px] font-bold leading-[1.1] tracking-tight">
          Start finding cheaper beauty today.
        </h1>

        <div className="mt-6">
          <TrialTimeline
            price={plan === "yearly" ? "$49.99" : "$7.99"}
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
            price="$7.99"
            sub="per month"
          />
          <PlanCard
            active={plan === "yearly"}
            onClick={() => {
              setPlan("yearly");
              track("paywall_plan_toggled", { plan: "yearly" });
            }}
            title="Yearly"
            price="$49.99"
            sub="$4.17 / mo"
            badge="Save 48%"
          />
        </div>
      </div>

      <div className="pb-safe space-y-2 px-6 pt-3">
        <button
          type="button"
          onClick={startTrial}
          className="tap flex h-[58px] w-full flex-col items-center justify-center rounded-[16px] bg-foreground text-background shadow-lift"
        >
          <span className="text-[15px] font-semibold">Start My Free Trial</span>
          <span className="text-[11px] opacity-80">
            5 days free, then {plan === "yearly" ? "$49.99/year" : "$7.99/month"} · cancel anytime
          </span>
        </button>
        {user && (
          <button
            type="button"
            onClick={handleClose}
            className="tap w-full pt-1 text-center text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Maybe later — keep browsing
          </button>
        )}
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
