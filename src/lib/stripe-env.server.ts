// Server-side Stripe environment resolution. Reads STRIPE_ENVIRONMENT as the
// canonical source. Throws in production if missing — we never want the
// server to silently flip live/sandbox based on NODE_ENV.

export type StripeEnv = "sandbox" | "live";

export function getServerStripeEnv(): StripeEnv {
  const explicit = process.env.STRIPE_ENVIRONMENT?.toLowerCase();
  if (explicit === "live" || explicit === "sandbox") return explicit;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STRIPE_ENVIRONMENT must be explicitly set to 'sandbox' or 'live' in production",
    );
  }
  return "sandbox";
}
