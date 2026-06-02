import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { OnboardingShell, PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";

export const Route = createFileRoute("/_onboarding/welcome")({
  component: Welcome,
  head: () => ({
    meta: [
      { title: "Welcome — Dupli" },
      { name: "description", content: "Stop overpaying. Start outsmarting. Find the dupe for everything." },
    ],
  }),
});

function Welcome() {
  const navigate = useNavigate();
  return (
    <OnboardingShell
      step={1}
      back={null}
      bgClass="bg-gradient-to-b from-background to-secondary/50"
      cta={
        <>
          <PrimaryCTA onClick={() => navigate({ to: "/goals" })}>
            Get started
          </PrimaryCTA>
          <Link
            to="/login"
            className="tap block text-center text-[13px] text-muted-foreground"
          >
            Already a member? Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <Eyebrow>AI Dupe Finder</Eyebrow>
          <h1 className="mt-4 font-display text-[42px] font-bold leading-[1.0] tracking-tight">
            Stop overpaying.
          </h1>
          <p className="font-display text-[42px] font-bold italic leading-[1.0] tracking-tight text-muted-foreground">
            Start outsmarting.
          </p>
          <p className="mx-auto mt-6 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
            Dupli finds the affordable version of any product you love — in seconds.
          </p>
        </motion.div>
      </div>
    </OnboardingShell>
  );
}
