import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/spending")({ component: Spending });

function Spending() {
  const navigate = useNavigate();
  const { monthlySpend, setAnswers } = useOnboarding();
  const display = monthlySpend >= 500 ? "$500+" : `$${monthlySpend}`;
  return (
    <OnboardingShell
      step={4}
      back="/age"
      cta={
        <PrimaryCTA onClick={() => navigate({ to: "/pain" })}>Continue</PrimaryCTA>
      }
    >
      <ScreenTitle>How much do you spend on beauty &amp; fashion?</ScreenTitle>
      <ScreenSubtitle>A rough monthly estimate. We&apos;ll use this to calculate what you could save.</ScreenSubtitle>

      <div className="mt-12 flex flex-1 flex-col items-center justify-center">
        <div className="font-display text-[72px] font-bold leading-none tracking-tight">
          {display}
        </div>
        <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">per month</p>

        <div className="mt-12 w-full">
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={monthlySpend}
            onChange={(e) => setAnswers({ monthlySpend: Number(e.target.value) })}
            className="w-full accent-foreground"
          />
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>$0</span>
            <span>$500+</span>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
