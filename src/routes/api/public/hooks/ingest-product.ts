// Ingest a single SkinSort product: fetch, parse, upsert ~50 rows.
// Token-protected. Mark queue item done on success, failed on error.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSkinsortUrl, slugify } from "@/server/skinsort-slugs";
import { parseSkinsortPage } from "@/server/skinsort-parser";
import {
  buildVendorsUrl,
  parseSkinsortVendors,
  type ParsedVendor,
} from "@/server/skinsort-vendors-parser";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchSkinsort(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  const body = res.ok ? await res.text() : "";
  return { status: res.status, body };
}

// Fetch + parse vendors for a product, then upsert them and recompute the
// product's lowest_price_usd. Failure is non-fatal: if vendors are missing or
// the fetch fails, we still keep the product/dupe rows.
async function ingestVendors(
  productId: string,
  brandSlug: string,
  productSlug: string,
): Promise<number> {
  const url = buildVendorsUrl(brandSlug, productSlug);
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) return 0;
    html = await res.text();
  } catch {
    return 0;
  }

  const vendors: ParsedVendor[] = parseSkinsortVendors(html);
  if (vendors.length === 0) return 0;

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
    console.error("vendor upsert failed", productId, upErr.message);
    return 0;
  }

  // Recompute denormalized lowest price.
  const prices = vendors
    .map((v) => v.priceUsd)
    .filter((p): p is number => typeof p === "number");
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  await supabaseAdmin
    .from("products")
    .update({ lowest_price_usd: lowest, last_priced_at: new Date().toISOString() })
    .eq("id", productId);

  return vendors.length;
}

async function upsertProduct(input: {
  brandSlug: string;
  productSlug: string;
  brandName: string;
  productName: string;
  category: string | null;
  imageUrl: string | null;
  ingredientsCount: number | null;
  freeFrom: string[];
  goodFor: string[];
  contains: string[];
  sourceUrl: string;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .upsert(
      {
        brand_slug: input.brandSlug,
        product_slug: input.productSlug,
        brand_name: input.brandName,
        product_name: input.productName,
        category: input.category,
        image_url: input.imageUrl,
        ingredients_count: input.ingredientsCount,
        free_from: input.freeFrom,
        good_for: input.goodFor,
        contains: input.contains,
        source_url: input.sourceUrl,
        last_ingested_at: new Date().toISOString(),
      },
      { onConflict: "brand_slug,product_slug" },
    )
    .select("id")
    .single();
  if (error) {
    console.error("upsertProduct failed", error);
    return null;
  }
  return data.id;
}

export const Route = createFileRoute("/api/public/hooks/ingest-product")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: bearer token must match INGESTION_TOKEN secret.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        const expected = process.env.INGESTION_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: {
          brandSlug?: string;
          productSlug?: string;
          queueId?: string;
          mode?: "full" | "vendors";
          productId?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
        }

        const brandSlug = body.brandSlug ? slugify(body.brandSlug) : "";
        const productSlug = body.productSlug ? slugify(body.productSlug) : "";
        if (!brandSlug || !productSlug) {
          return new Response(JSON.stringify({ error: "missing slugs" }), { status: 400 });
        }

        // Vendors-only mode: skip dupe parsing, just refresh prices for one product.
        if (body.mode === "vendors") {
          let productId = body.productId ?? "";
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
            if (body.queueId) {
              await supabaseAdmin
                .from("ingestion_queue")
                .update({
                  status: "failed",
                  last_error: "product not found for vendors mode",
                  processed_at: new Date().toISOString(),
                })
                .eq("id", body.queueId);
            }
            return new Response(
              JSON.stringify({ ok: false, reason: "product_not_found" }),
              { status: 200 },
            );
          }
          const written = await ingestVendors(productId, brandSlug, productSlug);
          if (body.queueId) {
            await supabaseAdmin
              .from("ingestion_queue")
              .update({ status: "done", processed_at: new Date().toISOString() })
              .eq("id", body.queueId);
          }
          return new Response(
            JSON.stringify({ ok: true, mode: "vendors", productId, vendorsWritten: written }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        const url = buildSkinsortUrl(brandSlug, productSlug);
        const { status, body: html } = await fetchSkinsort(url);

        if (status === 404) {
          if (body.queueId) {
            await supabaseAdmin
              .from("ingestion_queue")
              .update({
                status: "failed",
                last_error: "404 from skinsort",
                processed_at: new Date().toISOString(),
              })
              .eq("id", body.queueId);
          }
          return new Response(JSON.stringify({ ok: false, reason: "not_found" }), { status: 200 });
        }
        if (status !== 200 || !html) {
          if (body.queueId) {
            await supabaseAdmin
              .from("ingestion_queue")
              .update({ status: "failed", last_error: `http ${status}` })
              .eq("id", body.queueId);
          }
          return new Response(JSON.stringify({ ok: false, reason: `http_${status}` }), {
            status: 502,
          });
        }

        const parsed = parseSkinsortPage(html, brandSlug, productSlug);
        if (!parsed) {
          if (body.queueId) {
            await supabaseAdmin
              .from("ingestion_queue")
              .update({ status: "failed", last_error: "parse failed" })
              .eq("id", body.queueId);
          }
          return new Response(
            JSON.stringify({
              ok: false,
              reason: "parse_failed",
              htmlLen: html.length,
              titleSnippet: (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").slice(0, 200),
              hasBorder2: html.includes("border-2 border-warm-gray-500"),
            }),
            { status: 200 },
          );
        }

        const originalId = await upsertProduct({
          ...parsed.product,
          sourceUrl: url,
        });
        if (!originalId) {
          return new Response(JSON.stringify({ ok: false, reason: "upsert_failed" }), {
            status: 500,
          });
        }

        // Upsert each dupe product, then upsert the pair row.
        let dupesWritten = 0;
        for (const d of parsed.dupes) {
          const dupeId = await upsertProduct({
            brandSlug: d.brandSlug,
            productSlug: d.productSlug,
            brandName: d.brandName,
            productName: d.productName,
            category: null,
            imageUrl: d.imageUrl,
            ingredientsCount: null,
            freeFrom: [],
            goodFor: [],
            contains: [],
            sourceUrl: `https://skinsort.com/products/${d.brandSlug}/${d.productSlug}`,
          });
          if (!dupeId || dupeId === originalId) continue;
          const { error } = await supabaseAdmin.from("dupes").upsert(
            {
              original_product_id: originalId,
              dupe_product_id: dupeId,
              overall_match: d.overallMatch,
              ingredient_match: d.ingredientMatch,
              attribute_match: d.attributeMatch,
              shared_ingredients_count: d.sharedIngredientsCount,
              rationale: d.rationale,
              rank: d.rank,
              source: "skinsort",
            },
            { onConflict: "original_product_id,dupe_product_id" },
          );
          if (!error) dupesWritten++;
        }

        // Always fetch vendors for the original product (one extra HTTP call).
        // Dupes get their own vendor pass via mode: "vendors" jobs to keep
        // each worker invocation under timeout.
        const vendorsWritten = await ingestVendors(originalId, brandSlug, productSlug);

        if (body.queueId) {
          await supabaseAdmin
            .from("ingestion_queue")
            .update({ status: "done", processed_at: new Date().toISOString() })
            .eq("id", body.queueId);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            productId: originalId,
            dupesWritten,
            dupesParsed: parsed.dupes.length,
            vendorsWritten,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
