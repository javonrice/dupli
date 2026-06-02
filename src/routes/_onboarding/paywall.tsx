import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Star, ShieldCheck, Sparkles } from "lucide-react";
import { PrimaryCTA } from "@/components/onboarding/shell";
import {
  useOnboarding,
  projectedAnnualSavings,
} from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/paywall")({ component: Paywall });

type Plan = "annual" | "monthly" | "lifetime";

function Paywall() {
  const navigate = useNavigate();
  const answers = useOnboarding();
  const savings = projectedAnnualSavings(answers);

  const [plan, setPlan] = useState<Plan>("annual");
  const [xVisible, setXVisible] = useState(false);
  const [seconds, setSeconds] = useState(600); // 10:00 reservation

  useEffect(() => {
    const t = setTimeout(() => setXVisible(true), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const ctaLabel = plan === "annual" ? "Start 3-day free trial" : "Continue";

  return (
    <div className="relative flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />

      {/* Dim escape X (delayed) */}
      <button
        aria-label="Close"
        onClick={() => navigate({ to: "/downsell" })}
        className={`tap absolute right-3 top-safe z-10 flex h-9 w-9 items-center justify-center transition-opacity duration-700 ${
          xVisible ? "opacity-[0.18]" : "pointer-events-none opacity-0"
        }`}
        style={{ marginTop: "max(env(safe-area-inset-top), 8px)" }}
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex-1 overflow-y-auto px-6 pt-6">
        {/* Reservation countdown */}
        <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-[11.5px] font-semibold text-warning-foreground">
          <Sparkles className="h-3 w-3" />
          Your plan reserved · {mm}:{ss}
        </div>

        <h1 className="mt-4 font-display text-[30px] font-bold leading-[1.1] tracking-tight">
          Unlock your <span className="text-success">${savings.toLocaleString()}/yr</span> in savings
        </h1>

        <div className="mt-6 space-y-2.5">
          <PlanCard
            id="annual"
            selected={plan === "annual"}
            onSelect={() => setPlan("annual")}
            badge="MOST POPULAR · Save 67%"
            title="Annual"
            price="$39.99/yr"
            sub="Just $3.33/mo · 3 days free"
            highlight
          />
          <PlanCard
            id="monthly"
            selected={plan === "monthly"}
            onSelect={() => setPlan("monthly")}
            title="Monthly"
            price="$9.99/mo"
            sub="Cancel anytime"
          />
          <PlanCard
            id="lifetime"
            selected={plan === "lifetime"}
            onSelect={() => setPlan("lifetime")}
            title="Lifetime"
            price="$99 once"
            sub="One payment · yours forever"
          />
        </div>

        {/* Trust row */}
        <div className="mt-6 flex items-center justify-around text-center">
          <Trust icon={<Star className="h-4 w-4 fill-warning text-warning" />} label="4.8 rating" />
          <Trust icon={<Sparkles className="h-4 w-4" />} label="10,000+ savers" />
          <Trust icon={<ShieldCheck className="h-4 w-4" />} label="Money-back" />
        </div>

        {/* Testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-5 rounded-[16px] border border-border bg-card p-4"
        >
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
            ))}
          </div>
          <p className="mt-2 text-[13.5px] leading-snug">
            &ldquo;I cancelled three subscriptions in my first week. Paid for itself instantly.&rdquo;
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">Sarah, 26</p>
        </motion.div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          {plan === "annual"
            ? "3 days free, then $39.99 billed annually. Cancel anytime."
            : plan === "monthly"
              ? "$9.99 billed monthly. Cancel anytime."
              : "$99 one-time payment. Lifetime access."}
        </p>
      </div>

      <div className="pb-safe space-y-2 px-6 pb-6 pt-3">
        <PrimaryCTA pulse onClick={() => navigate({ to: "/complete", search: { plan } })}>
          {ctaLabel}
        </PrimaryCTA>
        <p className="text-center text-[10.5px] text-muted-foreground">
          No charge today · Reminder before trial ends
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  selected,
  onSelect,
  badge,
  title,
  price,
  sub,
  highlight,
}: {
  id: Plan;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
  title: string;
  price: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`tap relative flex w-full items-center justify-between rounded-[16px] border-2 p-4 text-left transition-colors ${
        selected
          ? "border-foreground bg-foreground/5"
          : "border-border bg-card"
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-background">
          {badge}
        </span>
      )}
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
      </div>
      <div className={`font-display text-[17px] font-bold ${highlight ? "text-success" : ""}`}>
        {price}
      </div>
    </button>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
