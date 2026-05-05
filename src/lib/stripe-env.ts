// Client-side Stripe environment resolution. Reads VITE_STRIPE_ENVIRONMENT
// as the canonical source. Falls back to the publishable token prefix only
// during transition; logs loudly in production builds when the explicit env
// var is missing.

export type StripeEnv = "sandbox" | "live";

export function getClientStripeEnv(): StripeEnv {
  const explicit = (import.meta.env.VITE_STRIPE_ENVIRONMENT as string | undefined)
    ?.toLowerCase();
  if (explicit === "live" || explicit === "sandbox") return explicit;

  if (import.meta.env.PROD) {
    // eslint-disable-next-line no-console
    console.error(
      "[stripe-env] VITE_STRIPE_ENVIRONMENT is not set. Falling back to token prefix detection — set this env var explicitly.",
    );
  }
  const tok = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
  return tok?.startsWith("pk_live_") ? "live" : "sandbox";
}
