import { createFileRoute, Navigate, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TabBar } from "@/components/tab-bar";
import { isAuthError, resetToOnboarding } from "@/lib/auth-reset";
import {
  getRouteResolution,
  type RouteResolution,
} from "@/server/onboarding.functions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [resolution, setResolution] = useState<RouteResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [transientError, setTransientError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Hard-paywall gate: only paid (or superuser) sessions render /app.
  // Unpaid users with onboarding incomplete go to the quiz; unpaid onboarded
  // users go to /paywall. Onboarding state is read server-side — localStorage
  // is never authoritative for authenticated routing.
  //
  // Auth/resolver failures NEVER fall through to /paywall — that traps deleted
  // or expired users. We sign out + clear stale state + send to /onboarding.
  // Transient (network/500) errors NEVER grant /app access and NEVER force a
  // bounce to /paywall — we show a retry surface instead.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setResolving(true);
    setTransientError(false);
    (async () => {
      try {
        const res = await getRouteResolution();
        if (!cancelled) setResolution(res);
      } catch (err) {
        if (cancelled) return;
        if (isAuthError(err)) {
          setResetting(true);
          await resetToOnboarding(navigate);
          return;
        }
        // Transient — surface a retry instead of routing into paywall or app.
        setTransientError(true);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, navigate, retryCount]);

  if (authLoading) return <SplashSpinner />;
  if (!user) return <Navigate to="/onboarding" replace />;
  if (resetting) return <SplashSpinner />;
  if (transientError) {
    return (
      <div className="flex h-screen-safe flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-[14px] text-muted-foreground">
          We couldn't reach the server. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => setRetryCount((n) => n + 1)}
          className="tap rounded-[14px] bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background"
        >
          Retry
        </button>
      </div>
    );
  }
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
