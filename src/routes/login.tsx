import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { lovable } from "@/integrations/lovable";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

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

  const handleGoogle = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/?next=${encodeURIComponent(next)}`,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed.");
        setSigningIn(false);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setSigningIn(false);
    }
  };

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
        <img src={wordmark} alt="Dupli" className="mb-10 h-16 w-auto" width={887} height={414} />
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
            } else {
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
                // Email confirmation required — show the "check your inbox" panel.
                setPendingConfirmEmail(email);
              }
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
          <button
            type="submit"
            disabled={signingIn}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {signingIn && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="tap w-full text-center text-[13px] text-muted-foreground"
        >
          {mode === "signin"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={signingIn}
          className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-card text-[15px] font-semibold disabled:opacity-60"
        >
          <GoogleGlyphDark />
          Continue with Google
        </button>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
      <div className="pb-safe" />
    </div>
  );
}

function GoogleGlyphDark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.9 2.68-6.6Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.32A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.92A9 9 0 0 0 0 9c0 1.45.35 2.83.92 4.04l3.05-2.32Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.96l3.05 2.32C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#FFFFFF"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.9 2.68-6.6Z"
      />
      <path
        fill="#FFFFFF"
        opacity=".85"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.32A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FFFFFF"
        opacity=".7"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.92A9 9 0 0 0 0 9c0 1.45.35 2.83.92 4.04l3.05-2.32Z"
      />
      <path
        fill="#FFFFFF"
        opacity=".55"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.96l3.05 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
