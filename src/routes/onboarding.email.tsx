import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { setPendingEmail } from "@/lib/onboarding";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailExists } from "@/server/onboarding.functions";

export const Route = createFileRoute("/onboarding/email")({
  component: EmailStep,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (import.meta.env.DEV) {
      console.debug("[onboarding-flow] /onboarding/email beforeLoad session=", data.session ? "yes" : "no");
    }
    // Anonymous: render the email screen. This is the common path from
    // the welcome splash — never bounce back to /onboarding.
    if (!data.session) return;

    // Sessioned: route by canonical destination. Never blanket-redirect to "/".
    try {
      const { getRouteResolution } = await import("@/server/onboarding.functions");
      const res = await getRouteResolution();
      const dest = res.destination;
      if (import.meta.env.DEV) {
        console.debug("[onboarding-flow] /onboarding/email resolver dest=", dest.to);
      }
      if (dest.to === "/app" || dest.to === "/paywall") {
        throw redirect({ to: dest.to });
      }
      if (dest.to === "/onboarding" && dest.search?.start === "quiz") {
        throw redirect({ to: "/onboarding", search: { start: "quiz" } });
      }
      // dest is /onboarding (welcome) — render the email screen anyway.
      return;
    } catch (e) {
      if (isRedirect(e)) throw e;
      const { isAuthError, clearStaleClientState } = await import("@/lib/auth-reset");
      if (isAuthError(e)) {
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        clearStaleClientState();
        return;
      }
      // Transient — render the email screen rather than trap.
      return;
    }
  },
  head: () => ({
    meta: [
      { title: "Your email — Dupli" },
      {
        name: "description",
        content: "Save your scans and dupes across devices.",
      },
    ],
  }),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailStep() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setPendingEmail(trimmed);
    let mode: "signup" | "login" = "signup";
    try {
      const res = await checkEmailExists({ data: { email: trimmed } });
      if (res?.exists) mode = "login";
    } catch {
      // fall through to signup; password screen handles duplicate-user fallback
    }
    navigate({ to: "/onboarding/password", search: { mode } });
  };

  return (
    <OnboardingShell
      step={1}
      total={1}
      hideProgress
      onBack={() => navigate({ to: "/onboarding" })}
    >
      <div className="flex flex-col px-1 pt-6">
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-tight">
          What's your email?
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          We'll use this to save your scan history and dupe results.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            className="h-[52px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
          />
          {error && (
            <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="tap flex h-[54px] w-full items-center justify-center rounded-[16px] bg-foreground text-[15px] font-semibold text-background shadow-lift disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </OnboardingShell>
  );
}
