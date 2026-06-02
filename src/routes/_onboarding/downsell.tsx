import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { OnboardingShell, PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";

export const Route = createFileRoute("/_onboarding/downsell")({ component: Downsell });

function Downsell() {
  const navigate = useNavigate();
  return (
    <OnboardingShell
      step={12}
      back="/paywall"
      bgClass="bg-gradient-to-b from-warning-soft/40 to-background"
      cta={
        <>
          <PrimaryCTA
            pulse
            onClick={() => navigate({ to: "/complete", search: { plan: "annual", discount: "1" } })}
          >
            Claim 50% off &mdash; $19.99/yr
          </PrimaryCTA>
          <button
            onClick={() => navigate({ to: "/complete", search: { plan: "free" } })}
            className="tap block w-full text-center text-[12.5px] text-muted-foreground"
          >
            No thanks, continue with 3 free scans
          </button>
        </>
      }
    >
      <Eyebrow>Wait — one-time offer</Eyebrow>
      <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.1] tracking-tight">
        Take <span className="text-success">50% off</span> your first year.
      </h1>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="mt-8 rounded-[18px] border border-border bg-card p-6 text-center"
      >
        <div className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
          Annual plan
        </div>
        <div className="mt-2 flex items-baseline justify-center gap-2">
          <div className="font-display text-[22px] font-bold text-muted-foreground line-through">
            $39.99
          </div>
          <div className="font-display text-[44px] font-bold tracking-tight text-success">
            $19.99
          </div>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">Just $1.67/month for a year</p>
      </motion.div>

      <p className="mt-6 text-[13.5px] leading-relaxed text-muted-foreground">
        This offer is only shown once. After today, the price returns to $39.99/yr.
      </p>
    </OnboardingShell>
  );
}
