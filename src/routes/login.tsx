import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Dupli" },
      { name: "description", content: "Sign in to save scans and build your dupe library." },
    ],
  }),
});

function LoginPage() {
  const { user, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleGoogle = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed.");
        setSigningIn(false);
        return;
      }
      // result.redirected => browser will navigate; we just wait.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setSigningIn(false);
    }
  };

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img src={wordmark} alt="Dupli" className="mb-10 h-16 w-auto" width={1536} height={1024} />
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

      <div className="px-6 pb-10 pt-4">
        {error && (
          <div className="mb-3 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}
        <button
          onClick={handleGoogle}
          disabled={signingIn}
          className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
        >
          {signingIn ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <GoogleGlyph />
          )}
          Continue with Google
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
      <div className="pb-safe" />
    </div>
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
