import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { OnboardingShell, PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_onboarding/social")({ component: SocialProof });

const TESTIMONIALS = [
  { name: "Maya, 24", text: "Found the Drunk Elephant dupe for $14. I'm never going back." },
  { name: "Priya, 31", text: "Cancelled my Sephora habit. Saving $180/month easily." },
  { name: "Jess, 28", text: "The Charlotte Tilbury wand dupe is *identical*. Saved $32." },
];

function SocialProof() {
  const navigate = useNavigate();
  return (
    <OnboardingShell
      step={6}
      back="/pain"
      bgClass="bg-gradient-to-b from-success-soft/40 to-background"
      cta={
        <PrimaryCTA onClick={() => navigate({ to: "/categories" })}>
          I&apos;m in
        </PrimaryCTA>
      }
    >
      <Eyebrow>You&apos;re in good company</Eyebrow>
      <h1 className="mt-3 font-display text-[36px] font-bold leading-[1.05] tracking-tight">
        <span className="text-success">94%</span> of Dupli users save{" "}
        <span className="whitespace-nowrap">$200+</span> a month.
      </h1>

      <div className="mt-7 space-y-3">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.4 }}
            className="rounded-[16px] border border-border bg-card p-4"
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, j) => (
                <Star key={j} className="h-3.5 w-3.5 fill-warning text-warning" />
              ))}
            </div>
            <p className="mt-2 text-[14px] leading-snug">&ldquo;{t.text}&rdquo;</p>
            <p className="mt-2 text-[12px] text-muted-foreground">{t.name}</p>
          </motion.div>
        ))}
      </div>
    </OnboardingShell>
  );
}
