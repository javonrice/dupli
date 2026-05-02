// Enqueue vendor-only refresh jobs for products that don't yet have any
// vendor rows. Token-protected. Runs in batches so a single call doesn't
// blow up under huge backfills.
//
// Usage:
//   POST /api/public/hooks/enqueue-vendor-backfill
//   { "limit": 5000 }   -> enqueue up to 5000 products that need vendors

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/enqueue-vendor-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        const expected = process.env.INGESTION_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }

        let body: { limit?: number; priority?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // empty body is fine
        }
        const limit = Math.min(Math.max(body.limit ?? 5000, 1), 50000);
        const priority = body.priority ?? -10; // lower than user-triggered ingests

        // Fetch products missing vendor rows. We page with id-cursor so we
        // can scan past Supabase's 1000-row default cap.
        const needed: { id: string; brand_slug: string; product_slug: string }[] = [];
        const PAGE = 1000;
        let cursor: string | null = null;
        while (needed.length < limit) {
          let q = supabaseAdmin
            .from("products")
            .select("id, brand_slug, product_slug, lowest_price_usd, last_priced_at")
            .is("last_priced_at", null)
            .order("id", { ascending: true })
            .limit(PAGE);
          if (cursor) q = q.gt("id", cursor);
          const { data: page, error } = await q;
          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { "content-type": "application/json" } },
            );
          }
          if (!page || page.length === 0) break;
          for (const p of page) {
            if (needed.length >= limit) break;
            needed.push({
              id: p.id,
              brand_slug: p.brand_slug,
              product_slug: p.product_slug,
            });
          }
          cursor = page[page.length - 1].id;
          if (page.length < PAGE) break;
        }

        if (needed.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, enqueued: 0, message: "all products have vendors" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // Skip products that already have a pending/processing vendor job.
        const { data: existing } = await supabaseAdmin
          .from("ingestion_queue")
          .select("product_id")
          .eq("mode", "vendors")
          .in("status", ["pending", "processing"])
          .in("product_id", needed.map((n) => n.id));
        const skip = new Set((existing ?? []).map((e) => e.product_id));

        const rows = needed
          .filter((n) => !skip.has(n.id))
          .map((n) => ({
            brand_slug: n.brand_slug,
            product_slug: n.product_slug,
            product_id: n.id,
            mode: "vendors" as const,
            status: "pending" as const,
            priority,
            reason: "vendor_backfill",
          }));

        // Insert in chunks of 500 to keep payload small.
        let inserted = 0;
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const { error } = await supabaseAdmin.from("ingestion_queue").insert(chunk);
          if (error) {
            console.error("vendor-backfill insert failed", error.message);
            break;
          }
          inserted += chunk.length;
        }

        return new Response(
          JSON.stringify({
            ok: true,
            scanned: needed.length,
            alreadyQueued: skip.size,
            enqueued: inserted,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
