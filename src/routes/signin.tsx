import { createFileRoute, Navigate, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/signin")({
  component: SignInPage,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Dupli" },
      { name: "description", content: "Welcome back. Sign in to your Dupli account." },
    ],
  }),
});

function SignInPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="px-4 pt-2 pb-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/onboarding" })}
          className="tap -ml-2 flex h-9 w-9 items-center justify-center rounded-full text-foreground"
          aria-label="Back to onboarding"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img src={wordmark} alt="Dupli" className="mb-10 h-16 w-auto" width={887} height={414} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Welcome back
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.05] tracking-tight">
          Sign in to Dupli.
        </h1>
        <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
          {mode === "signin"
            ? "Pick up your dupes and scan history right where you left off."
            : "Enter your email and we'll send you a reset link."}
        </p>
      </div>

      <div className="space-y-3 px-6 pb-10 pt-4">
        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSubmitting(true);
            if (mode === "signin") {
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              if (error) setError(error.message);
            } else {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) setError(error.message);
              else setForgotSent(true);
            }
            setSubmitting(false);
          }}
          className="space-y-2"
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-[48px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
          />
          {mode === "signin" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[48px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
            />
          )}
          {mode === "forgot" && forgotSent && (
            <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center text-[13px] text-muted-foreground">
              If an account exists for {email}, we sent a reset link.
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
            {mode === "signin" ? "Sign in" : "Send reset link"}
          </button>
        </form>

        {mode === "signin" ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForgotSent(false);
              setMode("forgot");
            }}
            className="tap w-full text-center text-[13px] text-muted-foreground"
          >
            Forgot password?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForgotSent(false);
              setMode("signin");
            }}
            className="tap w-full text-center text-[13px] text-muted-foreground"
          >
            Back to sign in
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate({ to: "/onboarding" })}
          className="tap w-full text-center text-[13px] text-muted-foreground"
        >
          New here? Go back and finish setup
        </button>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
      <div className="pb-safe" />
    </div>
  );
}
