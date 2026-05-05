import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
      window.location.replace("/onboarding");
    })();
  }, []);
  return (
    <div className="flex h-screen-safe items-center justify-center bg-background text-sm text-muted-foreground">
      Signing out…
    </div>
  );
}
