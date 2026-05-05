import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { setPendingEmail } from "@/lib/onboarding";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding/email")({
  component: EmailStep,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
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
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setPendingEmail(trimmed);
    navigate({ to: "/onboarding/password", search: { mode: "signup" } });
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || "Google sign-in failed.");
        setGoogleLoading(false);
        return;
      }
      if (result.redirected) return;
      // Got tokens — root resolver will route.
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setGoogleLoading(false);
    }
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

          <div className="relative my-2 flex items-center">
            <div className="h-px flex-1 bg-border" />
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[16px] border border-border bg-card text-[14px] font-semibold text-foreground disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <GoogleG />
                Continue with Google
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </OnboardingShell>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.67-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
