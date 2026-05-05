// Single source of truth for "this session is dead, restart cleanly."
// Used by every route guard so an invalid/deleted/expired user never gets
// trapped at /paywall — they always end up at /onboarding with a clean slate.

import { supabase } from "@/integrations/supabase/client";

/**
 * Keys we own and that influence routing/onboarding/paywall/scan flow. We
 * deliberately enumerate them rather than calling localStorage.clear() so we
 * don't nuke unrelated tabs/extensions.
 */
const STALE_LOCAL_KEYS = [
  "dupli.onboarding.v1",
  "dupli.paywall.reason",
];
const STALE_LOCAL_PREFIXES = ["dupli.checkout.", "dupli.scan.", "dupli.paywall."];
const STALE_SESSION_KEYS = [
  "dupli.onboarding.pending_email",
  "dupli.paywall.plan",
];
const STALE_SESSION_PREFIXES = ["dupli.checkout.", "dupli.scan.", "dupli.paywall."];

export function clearStaleClientState() {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    for (const k of STALE_LOCAL_KEYS) ls.removeItem(k);
    const lsKeys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && STALE_LOCAL_PREFIXES.some((p) => k.startsWith(p))) lsKeys.push(k);
    }
    lsKeys.forEach((k) => ls.removeItem(k));
  } catch {
    /* ignore */
  }
  try {
    const ss = window.sessionStorage;
    for (const k of STALE_SESSION_KEYS) ss.removeItem(k);
    const ssKeys: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && STALE_SESSION_PREFIXES.some((p) => k.startsWith(p))) ssKeys.push(k);
    }
    ssKeys.forEach((k) => ss.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * True iff the error indicates the session/user is no longer valid (deleted
 * user, expired/bad JWT, missing session). Network/500 errors are NOT auth
 * errors — those should surface as retryable failures, not a forced reset.
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  // Server middleware throws a fetch Response with 401/403.
  if (typeof Response !== "undefined" && err instanceof Response) {
    return err.status === 401 || err.status === 403;
  }
  const anyErr = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    name?: string;
    message?: string;
  };
  if (anyErr.status === 401 || anyErr.status === 403) return true;
  if (anyErr.statusCode === 401 || anyErr.statusCode === 403) return true;
  const code = (anyErr.code ?? "").toLowerCase();
  if (
    code === "user_not_found" ||
    code === "invalid_jwt" ||
    code === "bad_jwt" ||
    code === "session_not_found" ||
    code === "user_deleted"
  ) {
    return true;
  }
  const msg = (anyErr.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("unauthorized") ||
    msg.includes("user not found") ||
    msg.includes("user_not_found") ||
    msg.includes("invalid jwt") ||
    msg.includes("invalid_jwt") ||
    msg.includes("bad jwt") ||
    msg.includes("bad_jwt") ||
    msg.includes("jwt expired") ||
    msg.includes("session not found") ||
    msg.includes("session_not_found")
  );
}

/**
 * Sign out best-effort, clear stale client state, then route to /onboarding.
 * Pass a navigate function when called inside a React component; otherwise
 * we hard-replace the URL so we also drop any in-memory router state.
 */
export async function resetToOnboarding(
  navigate?: (opts: { to: "/onboarding"; replace?: boolean }) => void,
) {
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore — we want the redirect either way */
  }
  clearStaleClientState();
  if (navigate) {
    navigate({ to: "/onboarding", replace: true });
    return;
  }
  if (typeof window !== "undefined") {
    window.location.replace("/onboarding");
  }
}
