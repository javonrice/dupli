import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { OnboardingShell, Eyebrow } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/analyzing")({ component: Analyzing });

function Analyzing() {
  const navigate = useNavigate();
  const { brands, categories } = useOnboarding();
  const labels = [
    `Matching ${brands.length || "your"} favorite brands…`,
    `Scanning ${categories[0] || "skincare"} dupes…`,
    "Calculating your savings…",
    "Building your Dupe Plan…",
    "Almost there…",
  ];
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total = 5200;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / total));
      setI(Math.min(labels.length - 1, Math.floor((elapsed / total) * labels.length)));
      if (elapsed >= total) {
        clearInterval(tick);
        navigate({ to: "/reveal" });
      }
    }, 90);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingShell step={11} back={null} bgClass="bg-gradient-to-b from-background to-secondary/40">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Eyebrow>Analyzing</Eyebrow>
        <h1 className="mt-4 font-display text-[32px] font-bold leading-tight tracking-tight">
          Building your Dupe Plan
        </h1>

        <div className="mt-10 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-foreground"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(progress * 100)}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>

        <motion.p
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 text-[14px] text-muted-foreground"
        >
          {labels[i]}
        </motion.p>
      </div>
    </OnboardingShell>
  );
}
