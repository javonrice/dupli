# Fix: Stuck loading loop after successful live payment

## What's happening

After a successful payment in **live**, the user gets bounced between `/app` and `/paywall`, each showing a spinner briefly — looks like an infinite loading loop.

## Root cause

There are two sources of truth for "which Stripe environment am I in":

- **Client** (`getClientStripeEnv`) reads `VITE_STRIPE_ENVIRONMENT` — Vite bakes this in at build time. In production it correctly resolves to `"live"`.
- **Server** (`getServerStripeEnv`) reads `process.env.STRIPE_ENVIRONMENT` at runtime in the Cloudflare Worker.

`STRIPE_ENVIRONMENT="live"` is currently only declared in `.env.production`. Vite does NOT inject non-`VITE_*` vars into the Worker bundle, and `wrangler.jsonc` only declares `PADDLE_ENVIRONMENT`. So in the live Worker, `process.env.STRIPE_ENVIRONMENT` is `undefined`.

Per `getServerStripeEnv`, when missing it should throw in production — but `NODE_ENV` isn't reliably `"production"` in the Worker either, so it silently falls back to `"sandbox"`.

### The loop

1. User completes live payment → webhook writes a `live` subscription row (webhook reads env from `?env=` query param, so this works correctly — confirmed: row exists for the affected user with `status=trialing, environment=live`).
2. `/checkout/success` polls via the client (env=live) → finds the active sub → calls `getRouteResolution()` server-fn.
3. Server resolver runs with effective env `"sandbox"` → queries `subscriptions WHERE environment='sandbox'` → finds nothing → returns `destination: "/paywall"`.
4. Client navigates to `/paywall`. Paywall's `useSubscription` hook (client, env=live) sees `isActive=true` → `useEffect` redirects to `/app`.
5. `/app` (`_app.tsx`) calls the same server resolver → again returns `/paywall` → back to step 4.

Each hop renders the splash spinner, producing the visible loop.

## Fix

Add `STRIPE_ENVIRONMENT` to the Worker runtime so server and client agree on the environment.

### Change: `wrangler.jsonc`

Add `STRIPE_ENVIRONMENT` alongside `PADDLE_ENVIRONMENT`:

```jsonc
"vars": {
  "PADDLE_ENVIRONMENT": "live",
  "STRIPE_ENVIRONMENT": "live"
}
```

This makes `process.env.STRIPE_ENVIRONMENT` resolve to `"live"` in the deployed Worker, so:
- `getServerStripeEnv()` returns `"live"`
- `getRouteResolution()` queries the `live` subscription row, finds it active, returns `destination: "/app"`
- The loop stops immediately on the next deploy

### Verification after deploy

1. Sign in as the affected user (`844e8682-…`) on `trydupli.com` → should land on `/app` directly, no loop.
2. New live checkout → `/checkout/success` → `/app` cleanly.
3. Sandbox checkout in preview unaffected (preview uses dev env vars where `STRIPE_ENVIRONMENT="sandbox"`).

## Notes

- The webhook itself is fine — it reads env from the URL `?env=` param, which is why the live sub row was correctly tagged.
- No DB changes, no code changes beyond the one wrangler var.
- The orphaned `_app` ↔ `/paywall` ping-pong is also worth a small follow-up guard (e.g. trust client `isActive` as a tiebreaker), but the env fix removes the actual cause.
