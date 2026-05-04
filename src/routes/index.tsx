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
    // Race: maybe the session is already set by the time we subscribed.
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

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const allowed = ["/app", "/paywall"];
    const next =
      search.next && allowed.includes(search.next) ? search.next : null;

    if (typeof window !== "undefined" && !isOnboarded() && !next) {
      throw redirect({ to: "/onboarding" });
    }
    const session = await waitForOAuthSession();
    if (session) {
      throw redirect({ to: next ?? "/app" });
    }
    throw redirect({ to: "/login" });
  },
});
