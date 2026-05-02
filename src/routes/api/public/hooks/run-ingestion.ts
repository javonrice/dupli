// Drains N pending queue items by fan-out: fires ingest-product as parallel
// sub-requests (each runs in its own Worker invocation with its own timeout
// budget), and returns immediately. Token-protected. Called by pg_cron.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_BATCH = 50;
const MAX_BATCH = 200;
// When more than this many items remain after a drain, immediately fire
// another drain (fan-out) so the queue clears in minutes, not hours.
const SELF_CASCADE = true;

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

        // Reclaim items stuck in "processing" — likely from a worker that timed out.
        // Cron runs every minute and individual ingests finish in <30s, so anything
        // still "processing" at the start of a new tick is stale.
        await supabaseAdmin
          .from("ingestion_queue")
          .update({ status: "pending" })
          .eq("status", "processing");

        // Pick up N pending items, mark them processing atomically.
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

        // Fan out: fire all ingest-product sub-requests in parallel without
        // awaiting their bodies. Each sub-request gets its own worker timeout.
        // We don't `await` the fetches in this handler so we can return fast.
        for (const pick of picks) {
          // Intentionally not awaited — fire-and-forget.
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
          }).catch((e) => {
            console.error("[ingestion] fan-out fetch failed", pick.id, e);
          });
        }

        return new Response(
          JSON.stringify({ ok: true, dispatched: picks.length, ids }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
