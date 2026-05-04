import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOnboarded } from "@/lib/onboarding";

/**
 * Wait briefly for an in-flight OAuth redirect to finish hydrating the
 * session. Lovable's OAuth broker returns the user to `redirect_uri` (root)
 * with tokens in the URL hash; supabase-js processes that hash asynchronously
 * via `detectSessionInUrl`. Without this wait, `getSession()` runs before the
 * hash is parsed and we wrongly redirect to /login.
 */
async function waitForOAuthSession(timeoutMs = 4000) {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  const search = window.location.search;
  const looksLikeOAuth =
    hash.includes("access_token=") ||
    hash.includes("error=") ||
    search.includes("code=");
  if (!looksLikeOAuth) {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }
  return new Promise<import("@supabase/supabase-js").Session | null>((resolve) => {
    let settled = false;
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !settled) {
        settled = true;
        sub.data.subscription.unsubscribe();
        clearTimeout(timer);
        resolve(session);
      }
    });
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      sub.data.subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      resolve(data.session);
    }, timeoutMs);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !settled) {
        settled = true;
        sub.data.subscription.unsubscribe();
        clearTimeout(timer);
        resolve(data.session);
      }
    });
  });
}

const ALLOWED_NEXT = ["/app", "/paywall"];

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = typeof s.next === "string" ? s.next : undefined;
    return next ? { next } : {};
  },
  // IMPORTANT: do not redirect on the server. Onboarding state lives in
  // localStorage, which only exists on the client. Resolving the destination
  // server-side would always send fresh visitors to /login (no localStorage =
  // looks "onboarded but signed out"), which is not native-app behavior.
  // We render a tiny client-side splash and route from there.
  component: IndexSplash,
});

function IndexSplash() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next =
        search.next && ALLOWED_NEXT.includes(search.next) ? search.next : null;

      // 1. Signed-in users always go straight to the app, regardless of
      //    whether the local onboarding flag is set on this device. Otherwise
      //    a signed-in user on a fresh browser would be sent to /onboarding,
      //    which redirects back to / → infinite spinner loop.
      const session = await waitForOAuthSession();
      if (cancelled) return;
      if (session) {
        navigate({ to: next ?? "/app", replace: true });
        return;
      }

      // 2. Signed out + not onboarded → onboarding (unless an explicit
      //    `next=` was passed, e.g. from an OAuth callback).
      if (!isOnboarded() && !next) {
        navigate({ to: "/onboarding", replace: true });
        return;
      }

      // 3. Signed out + onboarded → login.
      navigate({ to: "/login", search: next ? { next } : undefined, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, search.next]);

  return (
    <div className="flex h-screen-safe items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
