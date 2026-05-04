import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { markOnboardingComplete, track } from "@/lib/onboarding";
import { TrialTimeline } from "@/components/onboarding/trial-timeline";

export const Route = createFileRoute("/paywall")({
  component: PaywallPage,
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

type Plan = "yearly" | "monthly";

function PaywallPage() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>("yearly");

  useEffect(() => {
    track("paywall_viewed_after_result");
  }, []);

  const startTrial = () => {
    track("trial_started", { plan });
    markOnboardingComplete();
    navigate({ to: "/app" });
  };

  const startCheap = () => {
    track("trial_started", { plan: "intro_99c" });
    markOnboardingComplete();
    navigate({ to: "/app" });
  };

  const dismiss = () => {
    track("paywall_dismissed");
    markOnboardingComplete();
    navigate({ to: "/app" });
  };

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
          <TrialTimeline price={plan === "yearly" ? "$39.99" : "$9.99"} />
        </div>

        <ul className="mt-6 space-y-2">
          {BENEFITS.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="text-[14px] font-semibold">{b}</span>
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
          className="tap flex h-[58px] w-full flex-col items-center justify-center rounded-[16px] bg-foreground text-background shadow-lift"
        >
          <span className="text-[15px] font-semibold">Start My Free Trial</span>
          <span className="text-[11px] opacity-80">
            7 days free, then {plan === "yearly" ? "$39.99/year" : "$9.99/month"} · cancel anytime
          </span>
        </button>
        <button
          type="button"
          onClick={startCheap}
          className="tap w-full text-center text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Or try for $0.99 your first month
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
