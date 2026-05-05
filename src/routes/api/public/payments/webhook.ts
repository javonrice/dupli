import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook, createStripeClient } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function resolveUserIdFromSubscription(
  subscription: any,
  env: StripeEnv,
): Promise<string | null> {
  const fromSub = subscription.metadata?.userId ?? null;
  if (fromSub) return fromSub;
  // Best-effort fallback: check the customer's metadata. We don't currently
  // set customer.metadata.userId at checkout, so this typically won't help —
  // but it's harmless and future-proofs the path.
  try {
    const customerId = subscription.customer;
    if (!customerId) return null;
    const stripe = createStripeClient(env);
    const customer = await stripe.customers.retrieve(customerId as string);
    if (!customer || (customer as any).deleted) return null;
    return (customer as any).metadata?.userId ?? null;
  } catch (e) {
    console.error("[webhook] customer lookup failed", e);
    return null;
  }
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  const userId = await resolveUserIdFromSubscription(subscription, env);
  if (!userId) {
    console.error("[webhook] orphan subscription created", {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      env,
    });
  }

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await (getSupabase() as any).from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  // Reconcile user_id if the existing row is unattached but we now have one.
  const updates: Record<string, unknown> = {
    status: subscription.status,
    product_id: productId,
    price_id: priceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await (getSupabase() as any)
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env)
    .maybeSingle();

  if (existing && !existing.user_id) {
    const resolved = await resolveUserIdFromSubscription(subscription, env);
    if (resolved) {
      updates.user_id = resolved;
      console.log("[webhook] reconciled orphan subscription", {
        subscriptionId: subscription.id,
        userId: resolved,
      });
    }
  }

  await (getSupabase() as any)
    .from("subscriptions")
    .update(updates)
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await (getSupabase() as any)
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
