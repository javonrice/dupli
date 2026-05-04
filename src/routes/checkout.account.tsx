import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { claimSubscriptions } from "@/server/claim.functions";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/checkout/account")({
  component: CheckoutAccountPage,
  head: () => ({
    meta: [
      { title: "Activate your account — Dupli" },
      { name: "description", content: "Create your Dupli account to activate your subscription." },
    ],
  }),
});

function CheckoutAccountPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  // If they're already authenticated when they land here, claim and forward.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setClaiming(true);
      try {
        const { claimed } = await claimSubscriptions();
        if (cancelled) return;
        if (claimed > 0) toast.success("Welcome to Dupli Pro 🎉");
        navigate({ to: "/app", search: { checkout: "success" }, replace: true });
      } catch (e) {
        console.error("[checkout/account] claim failed", e);
        if (!cancelled) navigate({ to: "/app", search: { checkout: "success" }, replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, navigate]);

  if (authLoading || claiming) {
    return (
      <div className="flex h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    // useEffect will navigate; render nothing in the meantime.
    return <Navigate to="/app" search={{ checkout: "success" }} replace />;
  }

  if (pendingConfirmEmail) {
    return (
      <div className="flex h-screen-safe flex-col bg-background">
        <div className="pt-safe" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 className="mb-4 h-10 w-10 text-success" />
          <h1 className="font-display text-[26px] font-bold leading-tight">
            Confirm your email
          </h1>
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-foreground">{pendingConfirmEmail}</span>.
            Tap it to finish activating your subscription.
          </p>
          <p className="mt-3 max-w-xs text-[12px] text-muted-foreground">
            Use the same email you used at checkout so we can link your purchase.
          </p>
        </div>
        <div className="pb-safe" />
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img src={wordmark} alt="Dupli" className="mb-8 h-12 w-auto" width={887} height={414} />
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          Payment received
        </div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
          {mode === "signup" ? "Create your account" : "Sign in to activate"}
        </h1>
        <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
          Use the <span className="font-semibold text-foreground">same email</span> you used at
          checkout so we can attach your subscription.
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
            try {
              if (mode === "signup") {
                const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo: `${window.location.origin}/checkout/account`,
                  },
                });
                if (error) {
                  setError(error.message);
                } else if (!data.session) {
                  setPendingConfirmEmail(email);
                }
              } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) setError(error.message);
              }
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-2"
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email used at checkout"
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
            disabled={submitting}
            className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
            {mode === "signup" ? "Create account & activate" : "Sign in & activate"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode((m) => (m === "signup" ? "signin" : "signup"));
          }}
          className="tap w-full text-center text-[13px] text-muted-foreground"
        >
          {mode === "signup" ? (
            <>Already have an account? <span className="font-semibold text-foreground">Sign in</span></>
          ) : (
            <>New here? <span className="font-semibold text-foreground">Create an account</span></>
          )}
        </button>
      </div>
    </div>
  );
}
