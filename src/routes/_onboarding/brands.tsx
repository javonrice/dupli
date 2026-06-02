import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_onboarding/brands")({ component: Brands });

const BRANDS = [
  "Sephora", "Drunk Elephant", "Charlotte Tilbury", "Rare Beauty",
  "Glossier", "Dyson", "Lululemon", "Aritzia",
  "Skims", "Olaplex", "Tatcha", "Summer Fridays",
];

function Brands() {
  const navigate = useNavigate();
  const { brands, toggle } = useOnboarding();
  return (
    <OnboardingShell
      step={8}
      back="/categories"
      cta={
        <PrimaryCTA onClick={() => navigate({ to: "/psych" })}>
          Continue
        </PrimaryCTA>
      }
    >
      <ScreenTitle>Which brands do you buy?</ScreenTitle>
      <ScreenSubtitle>Pick any you love — we&apos;ll surface the dupes that match them.</ScreenSubtitle>

      <div className="mt-7 grid grid-cols-2 gap-2.5">
        {BRANDS.map((b) => {
          const active = brands.includes(b);
          return (
            <button
              key={b}
              onClick={() => toggle("brands", b)}
              className={`tap relative flex h-[64px] items-center justify-center rounded-[14px] border px-3 text-center text-[13.5px] font-medium leading-tight transition-colors ${
                active
                  ? "border-foreground bg-foreground/5"
                  : "border-border bg-card"
              }`}
            >
              {b}
              {active && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
