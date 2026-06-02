import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/categories")({ component: Categories });

const CATEGORIES = ["Skincare", "Makeup", "Fragrance", "Fashion", "Home", "Tech"];

function Categories() {
  const navigate = useNavigate();
  const { categories, toggle } = useOnboarding();
  return (
    <OnboardingShell
      step={7}
      back="/social"
      cta={
        <PrimaryCTA
          onClick={() => navigate({ to: "/brands" })}
          disabled={categories.length === 0}
        >
          Continue
        </PrimaryCTA>
      }
    >
      <ScreenTitle>What do you shop for most?</ScreenTitle>
      <ScreenSubtitle>Pick everything you spend on. We&apos;ll find dupes across all of it.</ScreenSubtitle>

      <div className="mt-7 flex flex-wrap gap-2.5">
        {CATEGORIES.map((c) => {
          const active = categories.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggle("categories", c)}
              className={`tap rounded-full border px-5 py-3 text-[14px] font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
