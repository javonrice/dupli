// Client-side scan quota helpers. The server (requireScanEntitlement) is the
// source of truth — these helpers just mirror its 402 response into
// sessionStorage so the UI can disable the scan button and show a countdown
// without re-hitting the server on every render.

const REASON_KEY = "dupli.paywall.reason";
const RESET_KEY = "dupli.scan.blockedUntil";

export type PaywallReason = "quota" | null;

export function setScanBlocked(resetAtIso: string, reason: PaywallReason = "quota") {
  try {
    if (reason) window.sessionStorage.setItem(REASON_KEY, reason);
    window.sessionStorage.setItem(RESET_KEY, resetAtIso);
  } catch {
    /* ignore */
  }
}

export function readScanBlock(): { blocked: boolean; resetAt: string | null } {
  if (typeof window === "undefined") return { blocked: false, resetAt: null };
  try {
    const resetAt = window.sessionStorage.getItem(RESET_KEY);
    if (!resetAt) return { blocked: false, resetAt: null };
    if (new Date(resetAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(RESET_KEY);
      window.sessionStorage.removeItem(REASON_KEY);
      return { blocked: false, resetAt: null };
    }
    return { blocked: true, resetAt };
  } catch {
    return { blocked: false, resetAt: null };
  }
}

export function readPaywallReason(): PaywallReason {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(REASON_KEY);
    return v === "quota" ? "quota" : null;
  } catch {
    return null;
  }
}

export function clearPaywallReason() {
  try {
    window.sessionStorage.removeItem(REASON_KEY);
  } catch {
    /* ignore */
  }
}

export function formatResetCountdown(resetAt: string): string {
  const ms = new Date(resetAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
