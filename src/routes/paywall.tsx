import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/onboarding";
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
  const { user, loading: authLoading } = useAuth();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [introLoading, setIntroLoading] = useState(false);
  const [plan, setPlan] = useState<Plan>(() => {
    if (typeof window === "undefined") return "yearly";
    try {
      const saved = window.sessionStorage.getItem("dupli.paywall.plan");
      return saved === "monthly" || saved === "yearly" ? saved : "yearly";
    } catch {
      return "yearly";
    }
  });
  const [gateChecking, setGateChecking] = useState(true);
  const resumedRef = useRef(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("dupli.paywall.plan", plan);
    } catch {
      /* ignore */
    }
  }, [plan]);

  // Client-side gate: skip the paywall ONLY if the user is already signed in
  // and has an active subscription. We intentionally do NOT redirect anonymous
  // visitors to /login — the paywall is part of the onboarding funnel and must
  // be shown before account creation. Login is required later, at checkout.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setGateChecking(false);
        return;
      }
      try {
        const { getPaddleEnvironment } = await import("@/lib/paddle");
        const env = getPaddleEnvironment();
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("status,current_period_end")
          .eq("user_id", user.id)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub) {
          const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
          const future = end === null || end > Date.now();
          const active =
            (["active", "trialing", "past_due"].includes(sub.status) && future) ||
            (sub.status === "canceled" && end !== null && end > Date.now());
          if (active && !cancelled) {
            navigate({ to: "/app", replace: true });
            return;
          }
        }
      } catch (e) {
        console.error("[paywall] subscription check failed", e);
      }
      if (!cancelled) setGateChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, navigate]);

  useEffect(() => {
    track("paywall_viewed_after_result");
  }, []);

  const INTENT_KEY = "dupli.paywall.intent";
  const INTENT_TTL_MS = 15 * 60 * 1000;

  const saveIntent = (kind: "trial" | "intro") => {
    try {
      window.sessionStorage.setItem(
        INTENT_KEY,
        JSON.stringify({ kind, plan, at: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  };
  const consumeIntent = (): { kind: "trial" | "intro"; plan: Plan } | null => {
    try {
      const raw = window.sessionStorage.getItem(INTENT_KEY);
      if (!raw) return null;
      window.sessionStorage.removeItem(INTENT_KEY);
      const parsed = JSON.parse(raw) as { kind: string; plan: string; at: number };
      if (!parsed?.at || Date.now() - parsed.at > INTENT_TTL_MS) return null;
      const k = parsed.kind === "intro" ? "intro" : "trial";
      const p: Plan = parsed.plan === "monthly" ? "monthly" : "yearly";
      return { kind: k, plan: p };
    } catch {
      return null;
    }
  };

  const startTrial = async (planOverride?: Plan) => {
    const chosen = planOverride ?? plan;
    if (!user) {
      saveIntent("trial");
      toast.message("Create your account to start your trial.");
      navigate({ to: "/login", search: { next: "/paywall" } });
      return;
    }
    track("trial_started", { plan: chosen });
    try {
      await openCheckout({
        priceId: PRICE_IDS[chosen],
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/app?checkout=success`,
      });
    } catch (e) {
      console.error("[paywall] trial checkout failed", e);
      const msg = e instanceof Error ? e.message : "";
      if (/Price not found/i.test(msg)) {
        toast.error("Plan not available right now. Please try another plan.");
      } else if (/Paddle\.js failed to load|VITE_PAYMENTS_CLIENT_TOKEN/i.test(msg)) {
        toast.error("Payment system unavailable. Check your connection and retry.");
      } else {
        toast.error("Couldn't open checkout. Please try again.");
      }
    }
  };

  const startCheap = async () => {
    if (!user) {
      saveIntent("intro");
      toast.message("Create your account to claim the $0.99 offer.");
      navigate({ to: "/login", search: { next: "/paywall" } });
      return;
    }
    track("trial_started", { plan: "intro_99c" });
    setIntroLoading(true);
    try {
      const discountId = await getPaddleDiscountId(INTRO_DISCOUNT_DESCRIPTION);
      if (!discountId) {
        toast.error("Intro offer unavailable. Try the free trial instead.");
        return;
      }
      await openCheckout({
        priceId: PRICE_IDS.intro,
        discountId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/app?checkout=success`,
      });
    } catch (e) {
      console.error("[paywall] intro checkout failed", e);
      toast.error("Couldn't open checkout. Please try again.");
    } finally {
      setIntroLoading(false);
    }
  };

  // Auto-resume checkout after sign-in if a recent intent exists.
  useEffect(() => {
    if (authLoading || gateChecking) return;
    if (!user) return;
    if (resumedRef.current) return;
    const intent = consumeIntent();
    if (!intent) return;
    resumedRef.current = true;
    setPlan(intent.plan);
    if (intent.kind === "intro") {
      void startCheap();
    } else {
      void startTrial(intent.plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, gateChecking, user]);

  const busy = checkoutLoading || introLoading;

  if (authLoading || gateChecking) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="h-3" />

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
        {!user && (
          <button
            type="button"
            onClick={() => navigate({ to: "/login", search: { next: "/app" } })}
            className="tap w-full text-center text-[12px] text-muted-foreground"
          >
            Already a member? <span className="font-semibold text-foreground">Sign in</span>
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
