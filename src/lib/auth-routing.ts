// Canonical client-side routing helpers.
//
// Single point of truth for translating the server's RouteResolution into
// safe client navigation. All entry-point routes (/onboarding, /onboarding/email,
// /onboarding/password, /paywall, /_app, /) share this so behavior cannot
// drift across files.
//
// Rules:
//  - No session: caller decides (usually render the public splash/email page).
//  - Auth/JWT failure (deleted/expired user): clean reset → /onboarding.
//  - Transient/network failure: NEVER fall through to /paywall and NEVER
//    silently grant /app access. Caller decides whether to render with a
//    retry surface or bounce to /onboarding.

import { supabase } from "@/integrations/supabase/client";
import {
  clearStaleClientState,
  isAuthError,
  resetToOnboarding,
} from "@/lib/auth-reset";
import {
  getRouteResolution,
  type RouteDestination,
} from "@/server/onboarding.functions";

export type ResolverOutcome =
  | { kind: "anonymous" }
  | { kind: "destination"; destination: RouteDestination }
  | { kind: "auth_error" }
  | { kind: "transient_error"; error: unknown };

export async function resolveCanonicalDestination(): Promise<ResolverOutcome> {
  if (typeof window === "undefined") {
    // SSR: skip — let the client run it after hydration.
    return { kind: "transient_error", error: new Error("ssr") };
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { kind: "anonymous" };
  } catch {
    return { kind: "anonymous" };
  }
  try {
    const res = await getRouteResolution();
    return { kind: "destination", destination: res.destination };
  } catch (err) {
    if (isAuthError(err)) return { kind: "auth_error" };
    return { kind: "transient_error", error: err };
  }
}

/** Sign out + clear stale client state. Safe to await even with no session. */
export async function performAuthReset() {
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
  clearStaleClientState();
}

export { resetToOnboarding };
