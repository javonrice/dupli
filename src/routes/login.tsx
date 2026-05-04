import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import wordmark from "@/assets/dupli-wordmark.png";

const ALLOWED_NEXT = ["/app", "/paywall", "/onboarding"] as const;
function safeNext(n: unknown): string {
  if (typeof n !== "string") return "/app";
  return (ALLOWED_NEXT as readonly string[]).includes(n) ? n : "/app";
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = typeof s.next === "string" ? s.next : undefined;
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Dupli" },
      { name: "description", content: "Sign in to save scans and build your dupe library." },
    ],
  }),
});

function LoginPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const next = safeNext(search.next);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [forgotSent, setForgotSent] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);

  const handleLogoTap = async () => {
    // Dev-only QA escape hatch — never expose in production builds.
    if (!import.meta.env.DEV) return;
    const tapCount = logoTaps + 1;
    setLogoTaps(tapCount);
    if (tapCount >= 10) {
      setLogoTaps(0);
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
      window.location.href = "/onboarding";
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={next} />;
  }

  const handleResend = async () => {
    if (!pendingConfirmEmail) return;
    setResendState("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setResendState("idle");
    } else {
      setResendState("sent");
    }
  };

  if (pendingConfirmEmail) {
    return (
      <div className="flex h-screen-safe flex-col bg-background">
        <div className="pt-safe" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <img src={wordmark} alt="Dupli" className="mb-10 h-14 w-auto" width={887} height={414} />
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
            Check your inbox.
          </h1>
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-foreground">{pendingConfirmEmail}</span>. Tap it to
            finish creating your account.
          </p>
        </div>
        <div className="space-y-3 px-6 pb-10 pt-4">
          {error && (
            <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendState !== "idle"}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {resendState === "sending" && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
            {resendState === "sent" ? "Email sent" : "Resend confirmation email"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingConfirmEmail(null);
              setResendState("idle");
              setError(null);
              setMode("signin");
            }}
            className="tap w-full text-center text-[13px] text-muted-foreground"
          >
            Use a different email
          </button>
        </div>
        <div className="pb-safe" />
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img
          src={wordmark}
          alt="Dupli"
          className="mb-10 h-16 w-auto cursor-pointer select-none"
          width={887}
          height={414}
          onClick={handleLogoTap}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          AI Dupe Finder
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.05] tracking-tight">
          Snap any product.
        </h1>
        <p className="font-display text-[34px] font-bold italic leading-[1.05] tracking-tight text-muted-foreground">
          Find the dupe.
        </p>
        <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
          Sign in to save your dupes and keep your scan history across devices.
        </p>
      </div>

      <div className="px-6 pb-10 pt-4 space-y-3">
        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSigningIn(true);
            if (mode === "signin") {
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              if (error) setError(error.message);
            } else if (mode === "signup") {
              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                  emailRedirectTo: `${window.location.origin}/?next=${encodeURIComponent(next)}`,
                },
              });
              if (error) {
                setError(error.message);
              } else if (!data.session) {
                setPendingConfirmEmail(email);
              }
            } else {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) setError(error.message);
              else setForgotSent(true);
            }
            setSigningIn(false);
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
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
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
            disabled={signingIn}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {signingIn && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>

        {mode === "signin" && (
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
        )}

        <button
          type="button"
          onClick={() => {
            setError(null);
            setForgotSent(false);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="tap w-full text-center text-[13px] text-muted-foreground"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : mode === "forgot"
              ? "Back to sign in"
              : "Don't have an account? Sign up"}
        </button>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
      <div className="pb-safe" />
    </div>
  );
}

