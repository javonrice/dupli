import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingShell, PrimaryCTA, ScreenTitle, ScreenSubtitle } from "@/components/onboarding/shell";
import { useOnboarding } from "@/lib/onboarding-store";

export const Route = createFileRoute("/_onboarding/commit")({ component: Commit });

function Commit() {
  const navigate = useNavigate();
  const { setAnswers } = useOnboarding();
  return (
    <OnboardingShell
      step={10}
      back="/psych"
      cta={
        <>
          <PrimaryCTA
            pulse
            onClick={() => {
              setAnswers({ committed: true });
              navigate({ to: "/analyzing" });
            }}
          >
            Yes, I&apos;m ready
          </PrimaryCTA>
          <button
            onClick={() => navigate({ to: "/analyzing" })}
            className="tap block w-full text-center text-[13px] text-muted-foreground"
          >
            Maybe later
          </button>
        </>
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        <ScreenTitle>Are you ready to stop overpaying?</ScreenTitle>
        <ScreenSubtitle>
          We&apos;re about to build your personal Dupe Plan. It takes a moment — and it&apos;s only worth doing if you&apos;re committed.
        </ScreenSubtitle>
      </div>
    </OnboardingShell>
  );
}
