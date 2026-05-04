import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isOnboarded } from "@/lib/onboarding";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // First-time visitors (no completed onboarding) always start in onboarding,
    // regardless of whether they're signed in. Onboarding ends with either a
    // sample result, a real first scan, or the paywall — and from there the
    // user lands on /app or /login as appropriate.
    if (typeof window !== "undefined" && !isOnboarded()) {
      throw redirect({ to: "/onboarding" });
    }
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/app" : "/login" });
  },
});
