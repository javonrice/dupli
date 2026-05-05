import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

// Compatibility redirect. The standalone login form has been removed —
// /onboarding/email is now the single email/password auth entry point.
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/email", replace: true });
  },
  component: LoginRedirect,
});

function LoginRedirect() {
  return (
    <div className="flex h-screen-safe items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
