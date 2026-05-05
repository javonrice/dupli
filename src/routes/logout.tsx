import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearStaleClientState } from "@/lib/auth-reset";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      clearStaleClientState();
      window.location.replace("/onboarding");
    })();
  }, []);
  return (
    <div className="flex h-screen-safe items-center justify-center bg-background text-sm text-muted-foreground">
      Signing out…
    </div>
  );
}
