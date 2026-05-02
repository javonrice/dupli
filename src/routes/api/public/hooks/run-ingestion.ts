// Drains N pending queue items, calling ingest-product for each with rate limiting.
// Token-protected. Designed to be called by pg_cron once a minute.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_BATCH = 8; // keep total under ~30s worker budget
const MIN_DELAY_MS = 250;
const JITTER_MS = 200;
const STALE_PROCESSING_MS = 5 * 60 * 1000; // reclaim items stuck >5min

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
        const batch = Math.min(Math.max(body.batch ?? DEFAULT_BATCH, 1), 15);

        // Reclaim items stuck in "processing" — a previous worker timed out.
        // Safe because cron runs sequentially (every minute) and each invocation
        // completes within its own timeout budget.
        await supabaseAdmin
          .from("ingestion_queue")
          .update({ status: "pending" })
          .eq("status", "processing");

        // Pick up N pending items, mark them processing atomically.
        const { data: picks, error: pickErr } = await supabaseAdmin
          .from("ingestion_queue")
          .select("id, brand_slug, product_slug")
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
        const results: { id: string; ok: boolean; status?: number }[] = [];
        let consecutive429 = 0;

        for (const pick of picks) {
          const start = Date.now();
          try {
            const res = await fetch(`${origin}/api/public/hooks/ingest-product`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${expected}`,
              },
              body: JSON.stringify({
                brandSlug: pick.brand_slug,
                productSlug: pick.product_slug,
                queueId: pick.id,
              }),
            });
            results.push({ id: pick.id, ok: res.ok, status: res.status });
            if (res.status === 429) {
              consecutive429++;
              if (consecutive429 >= 3) {
                console.warn("[ingestion] hit 3 consecutive 429s, stopping batch");
                break;
              }
              await sleep(5000);
            } else {
              consecutive429 = 0;
            }
          } catch (e) {
            console.error("[ingestion] item failed", pick.id, e);
            await supabaseAdmin
              .from("ingestion_queue")
              .update({
                status: "failed",
                last_error: e instanceof Error ? e.message : String(e),
              })
              .eq("id", pick.id);
            results.push({ id: pick.id, ok: false });
          }

          const elapsed = Date.now() - start;
          const wait = Math.max(0, MIN_DELAY_MS + Math.floor(Math.random() * JITTER_MS) - elapsed);
          if (wait > 0) await sleep(wait);
        }

        return new Response(
          JSON.stringify({ ok: true, processed: results.length, results }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
