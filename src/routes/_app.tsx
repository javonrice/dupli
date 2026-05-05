import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TabBar } from "@/components/tab-bar";
import {
  getRouteResolution,
  type RouteResolution,
} from "@/server/onboarding.functions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const [resolution, setResolution] = useState<RouteResolution | null>(null);
  const [resolving, setResolving] = useState(false);

  // Hard-paywall gate: only paid (or superuser) sessions render /app.
  // Unpaid users with onboarding incomplete go to the quiz; unpaid onboarded
  // users go to /paywall. Onboarding state is read server-side — localStorage
  // is never authoritative for authenticated routing.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const res = await getRouteResolution();
        if (!cancelled) setResolution(res);
      } catch {
        // Fail-closed to paywall — never grant /app access on resolver error.
        if (!cancelled)
          setResolution({
            destination: { to: "/paywall" },
            hasActiveSub: false,
            onboardingCompleted: true,
            isSuperUser: false,
          });
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  if (authLoading) return <SplashSpinner />;
  if (!user) return <Navigate to="/onboarding/email" replace />;
  if (resolving || !resolution) return <SplashSpinner />;

  if (resolution.destination.to !== "/app") {
    const dest = resolution.destination;
    if (dest.to === "/onboarding") {
      return <Navigate to="/onboarding" search={dest.search} replace />;
    }
    return <Navigate to={dest.to} replace />;
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
