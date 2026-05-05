import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { TabBar } from "@/components/tab-bar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();

  if (authLoading) return <SplashSpinner />;
  if (!user) return <Navigate to="/onboarding/email" replace />;
  if (subLoading) return <SplashSpinner />;
  if (!isActive) return <Navigate to="/paywall" replace />;

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
