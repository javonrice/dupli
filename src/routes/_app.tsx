import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { TabBar } from "@/components/tab-bar";
import { getRouteResolution } from "@/server/onboarding.functions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);

  // Once auth is settled and the user is signed in, fetch the onboarding flag.
  // We need this to decide between paywall (sub missing but onboarded) and
  // the quiz (sub missing AND onboarding never finished — e.g. page refresh
  // mid-flow).
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getRouteResolution();
        if (!cancelled) setOnboardingCompleted(res.onboardingCompleted);
      } catch {
        if (!cancelled) setOnboardingCompleted(true); // fail-open to paywall
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  if (authLoading) return <SplashSpinner />;
  if (!user) return <Navigate to="/onboarding/email" replace />;
  if (subLoading || onboardingCompleted === null) return <SplashSpinner />;
  if (!isActive) {
    if (!onboardingCompleted) {
      return <Navigate to="/onboarding" search={{ start: "quiz" }} replace />;
    }
    return <Navigate to="/paywall" replace />;
  }

  return (
    <div className="relative min-h-screen-safe bg-background">
      <Outlet />
      <TabBar />
    </div>
  );
}

function SplashSpinner() {
  return (
    <div className="flex h-screen-safe items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
