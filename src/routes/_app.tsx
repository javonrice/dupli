import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { TabBar } from "@/components/tab-bar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // Hydrate session before child loaders run.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();
  const navigate = useNavigate();

  // Grace window for the post-checkout webhook to land. Without this, a
  // freshly-paid user briefly has no subscription row and would bounce back
  // to /paywall before the webhook writes it.
  const [graceUntil] = useState(() => {
    if (typeof window === "undefined") return 0;
    return window.location.search.includes("checkout=success")
      ? Date.now() + 20_000
      : 0;
  });
  const inGrace = Date.now() < graceUntil;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (subLoading) return;
    if (!isActive && !inGrace) {
      navigate({ to: "/paywall", replace: true });
    }
  }, [authLoading, subLoading, user, isActive, inGrace, navigate]);

  if (authLoading || !user || subLoading || (!isActive && !inGrace)) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen-safe bg-background">
      <Outlet />
      <TabBar />
    </div>
  );
}
