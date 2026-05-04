import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { markOnboardingComplete, track } from "@/lib/onboarding";

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
  "Share dupe cards with friends",
  "Compare products before you buy",
];

function PaywallPage() {
  const navigate = useNavigate();
  useEffect(() => {
    track("paywall_viewed_after_result");
  }, []);

  const startTrial = () => {
    track("trial_started", { plan: "annual_trial" });
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
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-lift">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-center font-display text-[28px] font-bold leading-tight tracking-tight">
          Keep finding better beauty buys.
        </h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-muted-foreground">
          Unlock unlimited scans, full comparisons, saved finds, and shareable dupe cards.
        </p>

        <ul className="mt-6 space-y-2.5">
          {BENEFITS.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="text-[14px] font-semibold">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pb-safe space-y-2 px-6 pt-3">
        <button
          type="button"
          onClick={startTrial}
          className="tap flex h-[58px] w-full flex-col items-center justify-center rounded-[16px] bg-foreground text-background shadow-lift"
        >
          <span className="text-[15px] font-semibold">Start Free Trial</span>
          <span className="text-[11px] opacity-80">7 days free, then $39.99/year</span>
        </button>
        <button
          type="button"
          onClick={startTrial}
          className="tap flex h-[52px] w-full flex-col items-center justify-center rounded-[16px] border border-border bg-card text-foreground"
        >
          <span className="text-[14px] font-semibold">Try for $0.99</span>
          <span className="text-[11px] text-muted-foreground">
            $0.99 first month, then $39.99/year
          </span>
        </button>
        <p className="pt-1 text-center text-[11px] text-muted-foreground">Cancel anytime.</p>
        <button
          type="button"
          onClick={dismiss}
          className="tap w-full pt-1 text-center text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Continue with limited access
        </button>
      </div>
    </div>
  );
}
