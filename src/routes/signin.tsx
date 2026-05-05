import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

// Compatibility redirect. /onboarding is the single branded public entry point.
export const Route = createFileRoute("/signin")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding", replace: true });
  },
  component: SigninRedirect,
});

function SigninRedirect() {
  return (
    <div className="flex h-screen-safe items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
