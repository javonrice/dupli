import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { OnboardingShell, PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/psych")({ component: Psych });

function Psych() {
  const navigate = useNavigate();
  const { monthlySpend } = useOnboarding();
  // Loss-aversion: annualized markup at ~45%
  const waste = Math.max(720, Math.round((monthlySpend * 12 * 0.45) / 50) * 50);

  return (
    <OnboardingShell
      step={9}
      back="/brands"
      bgClass="bg-gradient-to-b from-warning-soft/50 to-background"
      cta={
        <PrimaryCTA onClick={() => navigate({ to: "/commit" })}>
          Show me how to save
        </PrimaryCTA>
      }
    >
      <Eyebrow>Real talk</Eyebrow>
      <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.1] tracking-tight">
        Based on what you spend, you&apos;re on track to{" "}
        <span className="text-destructive">waste</span> this much in markup this year:
      </h1>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10 flex flex-col items-center"
      >
        <div className="font-display text-[80px] font-bold leading-none tracking-tight text-destructive">
          ${waste.toLocaleString()}
        </div>
        <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
          per year
        </p>
      </motion.div>

      <p className="mt-10 text-[14px] leading-relaxed text-muted-foreground">
        Most beauty &amp; fashion products carry a <span className="font-semibold text-foreground">40–70% markup</span> over the same formulas and materials. Dupli finds you the exact match — for less.
      </p>
    </OnboardingShell>
  );
}
