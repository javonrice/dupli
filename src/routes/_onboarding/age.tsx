import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding, type AgeBand } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/age")({ component: Age });

const BANDS: AgeBand[] = ["18-24", "25-29", "30-34", "35+"];

function Age() {
  const navigate = useNavigate();
  const { ageBand, setAnswers } = useOnboarding();
  return (
    <OnboardingShell
      step={3}
      back="/goals"
      cta={
        <PrimaryCTA
          onClick={() => navigate({ to: "/spending" })}
          disabled={!ageBand}
        >
          Continue
        </PrimaryCTA>
      }
    >
      <ScreenTitle>How old are you?</ScreenTitle>
      <ScreenSubtitle>So we can match you with people saving the most.</ScreenSubtitle>

      <div className="mt-7 grid grid-cols-2 gap-3">
        {BANDS.map((b) => {
          const active = ageBand === b;
          return (
            <button
              key={b}
              onClick={() => setAnswers({ ageBand: b })}
              className={`tap flex h-[88px] items-center justify-center rounded-[16px] border text-[18px] font-semibold transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card"
              }`}
            >
              {b}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
