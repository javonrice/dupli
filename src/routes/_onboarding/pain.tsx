import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding, type Pain } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/pain")({ component: PainScreen });

const OPTIONS: { id: Pain; label: string; sub: string }[] = [
  { id: "overpay", label: "I always feel like I'm overpaying", sub: "Even when I check reviews" },
  { id: "fomo", label: "I see dupes after I've already bought", sub: "Then I regret it" },
  { id: "unsure", label: "I never know which dupes actually work", sub: "TikTok lies to me" },
  { id: "subscription", label: "My subscriptions are draining me", sub: "Sephora, FabFitFun, you name it" },
];

function PainScreen() {
  const navigate = useNavigate();
  const { painPoint, setAnswers } = useOnboarding();
  return (
    <OnboardingShell
      step={5}
      back="/spending"
      cta={
        <PrimaryCTA
          onClick={() => navigate({ to: "/social" })}
          disabled={!painPoint}
        >
          Continue
        </PrimaryCTA>
      }
    >
      <ScreenTitle>What sounds most like you?</ScreenTitle>
      <ScreenSubtitle>You&apos;re not alone — most of our users said the same.</ScreenSubtitle>

      <div className="mt-7 space-y-2.5">
        {OPTIONS.map((o) => {
          const active = painPoint === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setAnswers({ painPoint: o.id })}
              className={`tap w-full rounded-[16px] border px-4 py-4 text-left transition-colors ${
                active ? "border-foreground bg-foreground/5" : "border-border bg-card"
              }`}
            >
              <div className="text-[15px] font-medium">{o.label}</div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{o.sub}</div>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
