import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — Dupli" },
      { name: "description", content: "Set a new password for your Dupli account." },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase fires PASSWORD_RECOVERY when the recovery link is consumed.
  // We also accept a freshly-restored session as proof we can call updateUser.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/app" }), 1200);
  };

  return (
    <div className="flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img src={wordmark} alt="Dupli" className="mb-8 h-12 w-auto" width={887} height={414} />
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">
          Set a new password
        </h1>
        <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
          Choose a new password for your account.
        </p>

        {!ready ? (
          <div className="mt-8 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying reset link…
          </div>
        ) : done ? (
          <p className="mt-8 text-[14px] font-medium text-foreground">
            Password updated. Redirecting…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 w-full max-w-xs space-y-2">
            {error && (
              <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[13px] text-destructive">
                {error}
              </div>
            )}
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[48px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-[48px] w-full rounded-[14px] border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
            />
            <button
              type="submit"
              disabled={submitting}
              className="tap flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
      <div className="pb-safe" />
    </div>
  );
}
