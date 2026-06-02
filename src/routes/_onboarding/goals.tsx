import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding, type Goal } from "@/lib/onboarding-store";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_onboarding/goals")({ component: Goals });

const OPTIONS: { id: Goal; label: string; emoji: string }[] = [
  { id: "save", label: "Save money", emoji: "💸" },
  { id: "luxury", label: "Find luxury for less", emoji: "✨" },
  { id: "smarter", label: "Shop smarter", emoji: "🧠" },
  { id: "impulse", label: "Stop impulse buys", emoji: "🛑" },
];

function Goals() {
  const navigate = useNavigate();
  const { goals, toggle } = useOnboarding();
  return (
    <OnboardingShell
      step={2}
      back="/welcome"
      cta={
        <PrimaryCTA
          onClick={() => navigate({ to: "/age" })}
          disabled={goals.length === 0}
        >
          Continue
        </PrimaryCTA>
      }
    >
      <ScreenTitle>What brings you to Dupli?</ScreenTitle>
      <ScreenSubtitle>Pick all that apply. We&apos;ll personalize your plan.</ScreenSubtitle>

      <div className="mt-7 space-y-2.5">
        {OPTIONS.map((o) => {
          const active = goals.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle("goals", o.id)}
              className={`tap flex w-full items-center gap-3 rounded-[16px] border px-4 py-4 text-left transition-colors ${
                active
                  ? "border-foreground bg-foreground/5"
                  : "border-border bg-card"
              }`}
            >
              <span className="text-xl">{o.emoji}</span>
              <span className="flex-1 text-[15px] font-medium">{o.label}</span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  active ? "border-foreground bg-foreground text-background" : "border-border"
                }`}
              >
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
