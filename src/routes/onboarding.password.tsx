import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { getPendingEmail, clearPendingEmail } from "@/lib/onboarding";
import { supabase } from "@/integrations/supabase/client";
import { getRouteResolution } from "@/server/onboarding.functions";

type Mode = "signup" | "login";

export const Route = createFileRoute("/onboarding/password")({
  component: PasswordStep,
  validateSearch: (s: Record<string, unknown>): { mode: Mode } => {
    const mode = s.mode === "login" ? "login" : "signup";
    return { mode };
  },
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Set your password — Dupli" },
      { name: "description", content: "One step left." },
    ],
  }),
});

function PasswordStep() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(search.mode);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const e = getPendingEmail();
    if (!e) {
      navigate({ to: "/onboarding/email", replace: true });
      return;
    }
    setEmail(e);
  }, [navigate]);

  useEffect(() => {
    setMode(search.mode);
  }, [search.mode]);

  if (!email) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) {
          const msg = error.message || "";
          if (/already.*registered|already.*exists|user.*exists/i.test(msg)) {
            setMode("login");
            setInfo(
              "Looks like you already have an account. Enter your password to continue.",
            );
            setError(null);
          } else {
            setError(msg);
          }
        } else {
          // Signed up — drop straight into the personalization quiz.
          clearPendingEmail();
          navigate({ to: "/onboarding", search: { start: "quiz" } });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
        } else {
          clearPendingEmail();
          // Canonical resolver decides where the user goes next.
          try {
            const res = await getRouteResolution();
            const dest = res.destination;
            if (dest.to === "/onboarding") {
              navigate({ to: "/onboarding", search: dest.search });
            } else {
              navigate({ to: dest.to });
            }
          } catch {
            navigate({ to: "/" });
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <OnboardingShell
      step={1}
      total={1}
      hideProgress
      onBack={() => navigate({ to: "/onboarding/email" })}
    >
      <div className="flex flex-col px-1 pt-6">
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-tight">
          {isSignup ? "Create a password" : "Welcome back"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {isSignup
            ? "This keeps your Dupli results saved across devices."
            : "Enter your password to continue."}
        </p>
        <p className="mt-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{email}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {/* Hidden username for password managers */}
          <input
            type="email"
            value={email}
            readOnly
            autoComplete="username"
            className="hidden"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="h-[52px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
          />
          {info && (
            <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center text-[13px] text-muted-foreground">
              {info}
            </div>
          )}
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
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isSignup ? (
              "Create account"
            ) : (
              "Continue"
            )}
          </button>
          {!isSignup && (
            <button
              type="button"
              onClick={async () => {
                setError(null);
                setInfo(null);
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) setError(error.message);
                else setInfo("Check your inbox for a reset link.");
              }}
              className="tap w-full text-center text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </OnboardingShell>
  );
}
