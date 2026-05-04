import { createFileRoute, redirect } from "@tanstack/react-router";
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
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      finish(data.session);
    }, timeoutMs);
    // Race: maybe the session is already set by the time we subscribed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(data.session);
    });
  });
}

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // First-time visitors (no completed onboarding) always start in onboarding,
    // regardless of whether they're signed in. Onboarding ends with either a
    // sample result, a real first scan, or the paywall — and from there the
    // user lands on /app or /login as appropriate.
    if (typeof window !== "undefined" && !isOnboarded()) {
      throw redirect({ to: "/onboarding" });
    }
    const session = await waitForOAuthSession();
    throw redirect({ to: session ? "/app" : "/login" });
  },
});
