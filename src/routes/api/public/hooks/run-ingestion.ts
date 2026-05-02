// Drains pending queue items.
//
// Vendor-only jobs are very fast (1 fetch + 1 upsert), so we process them
// INLINE in parallel chunks within this handler. Cloudflare Workers kill
// fire-and-forget fetches once the parent response returns, so awaiting the
// work is the only reliable way to make progress.
//
// `full` mode jobs (initial product+dupes ingest) are slower and may
// approach the worker timeout, so we still fan them out via fetch.
//
// Token-protected. Called by pg_cron and self-cascading.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "@/server/skinsort-slugs";
import {
  buildVendorsUrl,
  parseSkinsortVendors,
  type ParsedVendor,
} from "@/server/skinsort-vendors-parser";

const DEFAULT_BATCH = 80;
const MAX_BATCH = 300;
const VENDOR_CONCURRENCY = 20; // simultaneous vendor fetches inside one drain
const SELF_CASCADE = true;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Pick = {
  id: string;
  brand_slug: string;
  product_slug: string | null;
  mode: string | null;
  product_id: string | null;
};

// Run an inline vendor fetch+upsert for one queue item. Always marks the
// queue row done/failed so a stuck row never blocks the queue.
async function runVendorJob(pick: Pick): Promise<void> {
  const brandSlug = slugify(pick.brand_slug);
  const productSlug = pick.product_slug ? slugify(pick.product_slug) : "";
  if (!brandSlug || !productSlug) {
    await supabaseAdmin
      .from("ingestion_queue")
      .update({
        status: "failed",
        last_error: "missing slugs",
        processed_at: new Date().toISOString(),
      })
      .eq("id", pick.id);
    return;
  }

  let productId = pick.product_id ?? "";
  if (!productId) {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("brand_slug", brandSlug)
      .eq("product_slug", productSlug)
      .maybeSingle();
    productId = prod?.id ?? "";
  }
  if (!productId) {
    await supabaseAdmin
      .from("ingestion_queue")
      .update({
        status: "failed",
        last_error: "product not found",
        processed_at: new Date().toISOString(),
      })
      .eq("id", pick.id);
    return;
  }

  let html = "";
  try {
    const res = await fetch(buildVendorsUrl(brandSlug, productSlug), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (res.ok) html = await res.text();
  } catch {
    // network error — fall through, vendors=[] -> mark done with no rows
  }

  const vendors: ParsedVendor[] = html ? parseSkinsortVendors(html) : [];

  if (vendors.length > 0) {
    const rows = vendors.map((v) => ({
      product_id: productId,
      merchant: v.merchant,
      url: v.url,
      price_usd: v.priceUsd,
      currency: v.currency,
      rank: v.rank,
      fetched_at: new Date().toISOString(),
    }));
    const { error: upErr } = await supabaseAdmin
      .from("product_vendors")
      .upsert(rows, { onConflict: "product_id,merchant" });
    if (upErr) {
      await supabaseAdmin
        .from("ingestion_queue")
        .update({
          status: "failed",
          last_error: `upsert: ${upErr.message}`.slice(0, 500),
          processed_at: new Date().toISOString(),
        })
        .eq("id", pick.id);
      return;
    }
  }

  const prices = vendors
    .map((v) => v.priceUsd)
    .filter((p): p is number => typeof p === "number");
  const lowest = prices.length > 0 ? Math.min(...prices) : null;

  await supabaseAdmin
    .from("products")
    .update({
      lowest_price_usd: lowest,
      last_priced_at: new Date().toISOString(),
    })
    .eq("id", productId);

  await supabaseAdmin
    .from("ingestion_queue")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .eq("id", pick.id);
}

// Tiny pool: run jobs in parallel up to `concurrency`.
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx]);
      } catch (e) {
        console.error("[ingestion] worker crashed", e);
      }
    }
  });
  await Promise.all(runners);
}

export const Route = createFileRoute("/api/public/hooks/run-ingestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        const expected = process.env.INGESTION_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }

        let body: { batch?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // empty body is fine
        }
        const batch = Math.min(Math.max(body.batch ?? DEFAULT_BATCH, 1), MAX_BATCH);

        // Reclaim items stuck in "processing" from a previous timed-out run.
        await supabaseAdmin
          .from("ingestion_queue")
          .update({ status: "pending" })
          .eq("status", "processing");

        // Pick up N pending items.
        const { data: picks, error: pickErr } = await supabaseAdmin
          .from("ingestion_queue")
          .select("id, brand_slug, product_slug, mode, product_id")
          .eq("status", "pending")
          .not("product_slug", "is", null)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(batch);

        if (pickErr) {
          return new Response(JSON.stringify({ error: pickErr.message }), { status: 500 });
        }
        if (!picks || picks.length === 0) {
          return new Response(JSON.stringify({ ok: true, processed: 0, drained: true }), {
            status: 200,
          });
        }

        const ids = picks.map((p) => p.id);
        await supabaseAdmin
          .from("ingestion_queue")
          .update({ status: "processing" })
          .in("id", ids);

        const origin = new URL(request.url).origin;

        // Split picks by mode.
        const vendorPicks = picks.filter((p) => (p.mode ?? "full") === "vendors") as Pick[];
        const fullPicks = picks.filter((p) => (p.mode ?? "full") !== "vendors");

        // Fan out the slow `full` jobs (they may take ~20s each — too long
        // to inline). These DO get killed if the parent returns, so we kick
        // a smaller number per drain. Cron picks them up next tick anyway.
        for (const pick of fullPicks) {
          fetch(`${origin}/api/public/hooks/ingest-product`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${expected}`,
            },
            body: JSON.stringify({
              brandSlug: pick.brand_slug,
              productSlug: pick.product_slug,
              queueId: pick.id,
              mode: pick.mode ?? "full",
              productId: pick.product_id ?? undefined,
            }),
          }).catch((e) => console.error("[ingestion] full fan-out failed", pick.id, e));
        }

        // Process vendor jobs INLINE in parallel — these are fast and we
        // need to await them so Cloudflare doesn't kill the in-flight work.
        // Kick the cascade BEFORE awaiting so the next drain runs in
        // parallel with this one.
        if (SELF_CASCADE && picks.length >= batch) {
          fetch(`${origin}/api/public/hooks/run-ingestion`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${expected}`,
            },
            body: JSON.stringify({ batch }),
          }).catch((e) => console.error("[ingestion] cascade fetch failed", e));
        }

        await runPool(vendorPicks, VENDOR_CONCURRENCY, runVendorJob);

        return new Response(
          JSON.stringify({
            ok: true,
            dispatched: picks.length,
            vendorsProcessed: vendorPicks.length,
            fullDispatched: fullPicks.length,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
