import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import {
  useOnboarding,
  projectedAnnualSavings,
  dupeStyleFor,
} from "@/lib/onboarding-store";
import { PrimaryCTA, Eyebrow } from "@/components/onboarding/shell";
import wordmark from "@/assets/dupli-wordmark.png";

const searchSchema = z.object({
  plan: z.enum(["annual", "monthly", "lifetime", "free"]).optional(),
  discount: z.string().optional(),
});

export const Route = createFileRoute("/_onboarding/complete")({
  component: Complete,
  validateSearch: searchSchema,
});

/**
 * Post-paywall auth screen. Collects email/password (or Google), then writes
 * onboarding answers + computed savings/style to the user's profile and routes
 * into the app.
 *
 * NOTE: Stripe checkout is not wired yet. When that ships, this route will
 * land here AFTER a successful Stripe session and read session_id from the URL
 * to link the subscription. For now, completing auth marks onboarding done
 * and lets the user in (free or trial mode based on selected plan).
 */
function Complete() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const answers = useOnboarding();
  const reset = useOnboarding((s) => s.reset);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If they're already authed, just persist + redirect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        await persistAndGo(data.session.user.id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistAndGo(userId: string) {
    const savings = projectedAnnualSavings(answers);
    const style = dupeStyleFor(answers);
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        onboarding_answers: {
          ...answers,
          selected_plan: search.plan ?? "annual",
          discount_used: search.discount === "1",
          completed_at: new Date().toISOString(),
        },
        dupe_style: style,
        projected_annual_savings: savings,
      })
      .eq("user_id", userId);
    if (upErr) {
      // Not fatal — still let them in.
      console.error("Failed to save onboarding answers:", upErr);
    }
    reset();
    navigate({ to: "/app" });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWorking(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/complete" },
        });
        if (error) throw error;
        if (data.user && data.session) {
          await persistAndGo(data.user.id);
          return;
        }
        // email confirmation required
        setError("Check your email to confirm, then come back to finish setup.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await persistAndGo(data.user.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setWorking(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setWorking(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/complete",
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed.");
        setWorking(false);
      }
      // otherwise broker will redirect
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setWorking(false);
    }
  }

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <img src={wordmark} alt="Dupli" className="h-10 w-auto" width={887} height={414} />
        <Eyebrow>
          {search.plan === "free"
            ? "You're in (free mode)"
            : "Last step"}
        </Eyebrow>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight">
          {search.plan === "free"
            ? "Create your account to start scanning"
            : "Create your account to save your plan"}
        </h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          We'll keep your Dupe Plan synced across devices.
        </p>

        {error && (
          <div className="mt-4 rounded-[12px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={working}
          className="tap mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-card text-[15px] font-semibold disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-2">
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
            placeholder="Password (6+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-[48px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
          />
          <PrimaryCTA onClick={() => {}} disabled={working}>
            <button type="submit" disabled={working} className="flex items-center gap-2">
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </PrimaryCTA>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="tap mt-3 w-full text-center text-[12.5px] text-muted-foreground"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </div>
      <div className="pb-safe" />
    </div>
  );
}
