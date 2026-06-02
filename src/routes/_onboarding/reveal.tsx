import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { OnboardingShell, PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";
import {
  useOnboarding,
  projectedAnnualSavings,
  dupeStyleFor,
} from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/reveal")({ component: Reveal });

function Reveal() {
  const navigate = useNavigate();
  const answers = useOnboarding();
  const savings = projectedAnnualSavings(answers);
  const style = dupeStyleFor(answers);

  return (
    <OnboardingShell
      step={12}
      back={null}
      bgClass="bg-gradient-to-b from-success-soft/40 to-background"
      cta={
        <PrimaryCTA pulse onClick={() => navigate({ to: "/paywall" })}>
          Unlock my plan
        </PrimaryCTA>
      }
    >
      <Eyebrow>Your Dupe Plan is ready</Eyebrow>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="mt-3 font-display text-[28px] font-bold leading-tight tracking-tight">
          You could save
        </h1>
        <div className="mt-2 font-display text-[64px] font-bold leading-none tracking-tight text-success">
          ${savings.toLocaleString()}
        </div>
        <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
          per year with Dupli
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="mt-6 rounded-[18px] border border-border bg-card p-5"
      >
        <Eyebrow>Your Dupe Style</Eyebrow>
        <div className="mt-1 font-display text-[26px] font-bold tracking-tight">{style}</div>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          We&apos;ll tailor every dupe match to this profile.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="relative mt-4 overflow-hidden rounded-[18px] border border-border bg-card p-5"
      >
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-3/4 rounded bg-muted" />
                <div className="h-2 w-1/2 rounded bg-muted" />
              </div>
              <div className="h-6 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12px] font-semibold text-background">
            <Lock className="h-3.5 w-3.5" />
            Your matches are locked
          </div>
        </div>
      </motion.div>
    </OnboardingShell>
  );
}
