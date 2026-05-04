import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { TabBar } from "@/components/tab-bar";

const GRACE_KEY = "dupli.checkout.grace_until";
const GRACE_MS = 30_000;

export const Route = createFileRoute("/_app")({
  // IMPORTANT: do NOT check session in beforeLoad. beforeLoad runs during SSR
  // where the browser supabase client has no storage and getSession() always
  // returns null — that would bounce signed-in users (and freshly-paid
  // returning customers) to /login on every hard navigation. Auth + sub gate
  // happens in the client component below.
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();

  // Grace window for the post-checkout webhook to land. Persisted to
  // sessionStorage so it survives the URL cleanup `replace` in /_app/app.
  const [graceUntil, setGraceUntil] = useState<number>(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("checkout=success")) {
      const until = Date.now() + GRACE_MS;
      try {
        window.sessionStorage.setItem(GRACE_KEY, String(until));
      } catch {
        /* ignore */
      }
      setGraceUntil(until);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(GRACE_KEY);
      const until = raw ? parseInt(raw, 10) : 0;
      if (until && until > Date.now()) setGraceUntil(until);
      else if (raw) window.sessionStorage.removeItem(GRACE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Tick once when grace expires so we re-render and gate properly.
  useEffect(() => {
    if (!graceUntil) return;
    const ms = graceUntil - Date.now();
    if (ms <= 0) return;
    const t = window.setTimeout(() => setGraceUntil((g) => g), ms + 50);
    return () => window.clearTimeout(t);
  }, [graceUntil]);

  const inGrace = graceUntil > Date.now();

  if (authLoading) {
    return <SplashSpinner />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (subLoading) {
    return <SplashSpinner />;
  }
  if (!isActive && !inGrace) {
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
