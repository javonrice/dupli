// Discovery hub server functions — read from the local products + dupes mirror.
// All queries use the service-role admin client because products/dupes have
// permissive read policies and we don't need per-user filtering for these
// (recent scans is the exception and uses the user-scoped client).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScanRow } from "@/server/scans.functions";

export type CommunityDupe = {
  /** Stable string id for React keys + share URLs (we use the dupe row id). */
  id: string;
  overallMatch: number;
  ingredientMatch: number | null;
  attributeMatch: number | null;
  sharedIngredientsCount: number | null;
  rationale: string | null;
  original: {
    id: string;
    brandSlug: string;
    productSlug: string;
    brand: string;
    productName: string;
    category: string | null;
    imageUrl: string | null;
    lowestPriceUsd: number | null;
  };
  dupe: {
    id: string;
    brandSlug: string;
    productSlug: string;
    brand: string;
    productName: string;
    category: string | null;
    imageUrl: string | null;
    lowestPriceUsd: number | null;
  };
};

type DupeJoinRow = {
  id: string;
  overall_match: number;
  ingredient_match: number | null;
  attribute_match: number | null;
  shared_ingredients_count: number | null;
  rationale: string | null;
  original: {
    id: string;
    brand_slug: string;
    product_slug: string;
    brand_name: string;
    product_name: string;
    category: string | null;
    image_url: string | null;
    lowest_price_usd: number | null;
  } | null;
  dupe: {
    id: string;
    brand_slug: string;
    product_slug: string;
    brand_name: string;
    product_name: string;
    category: string | null;
    image_url: string | null;
    lowest_price_usd: number | null;
  } | null;
};

const DUPE_SELECT = `
  id, overall_match, ingredient_match, attribute_match, shared_ingredients_count, rationale,
  original:products!dupes_original_product_id_fkey ( id, brand_slug, product_slug, brand_name, product_name, category, image_url, lowest_price_usd ),
  dupe:products!dupes_dupe_product_id_fkey ( id, brand_slug, product_slug, brand_name, product_name, category, image_url, lowest_price_usd )
`;

function mapRow(row: DupeJoinRow): CommunityDupe | null {
  if (!row.original || !row.dupe) return null;
  // Drop pairings with no images — they look broken in the hub.
  if (!row.original.image_url || !row.dupe.image_url) return null;
  // The dupe is the thing the user shops for — require it to have a price.
  if (row.dupe.lowest_price_usd == null) return null;
  return {
    id: row.id,
    overallMatch: row.overall_match,
    ingredientMatch: row.ingredient_match,
    attributeMatch: row.attribute_match,
    sharedIngredientsCount: row.shared_ingredients_count,
    rationale: row.rationale,
    original: {
      id: row.original.id,
      brandSlug: row.original.brand_slug,
      productSlug: row.original.product_slug,
      brand: row.original.brand_name,
      productName: row.original.product_name,
      category: row.original.category,
      imageUrl: row.original.image_url,
      lowestPriceUsd: row.original.lowest_price_usd,
    },
    dupe: {
      id: row.dupe.id,
      brandSlug: row.dupe.brand_slug,
      productSlug: row.dupe.product_slug,
      brand: row.dupe.brand_name,
      productName: row.dupe.product_name,
      category: row.dupe.category,
      imageUrl: row.dupe.image_url,
      lowestPriceUsd: row.dupe.lowest_price_usd,
    },
  };
}

/**
 * Deterministic "Dupe of the Day" — picks one high-quality dupe per UTC day.
 *
 * Strategy: pull a small candidate window of strong matches (overall_match >= 80)
 * and pick the index seeded by today's date. This stays consistent for every
 * user on a given day without needing a cron job or extra storage.
 */
export const getDupeOfTheDay = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ dupe: CommunityDupe | null }> => {
    // Window the candidates to keep things performant + high quality.
    const { data, error } = await supabaseAdmin
      .from("dupes")
      .select(DUPE_SELECT)
      .gte("overall_match", 80)
      .order("overall_match", { ascending: false })
      .limit(2000);

    if (error || !data?.length) {
      console.warn("getDupeOfTheDay query failed", error);
      return { dupe: null };
    }

    const mapped = (data as unknown as DupeJoinRow[])
      .map(mapRow)
      .filter((x): x is CommunityDupe => x !== null);
    if (!mapped.length) return { dupe: null };

    // Date-seeded pick (UTC, YYYYMMDD).
    const today = new Date();
    const seed =
      today.getUTCFullYear() * 10000 +
      (today.getUTCMonth() + 1) * 100 +
      today.getUTCDate();
    const idx = seed % mapped.length;
    return { dupe: mapped[idx] };
  },
);

/** Trending dupes — currently ranked by overall_match. Will swap to scan-frequency
 *  once we have more user-generated scan data. */
export const getTrendingDupes = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ limit: z.number().min(1).max(50).optional() }).parse(data))
  .handler(async ({ data }): Promise<{ dupes: CommunityDupe[] }> => {
    const limit = data.limit ?? 12;
    // Pull a wider window so we can de-dupe by original product (avoid showing
    // 6 dupes for the same Drunk Elephant cream).
    const { data: rows, error } = await supabaseAdmin
      .from("dupes")
      .select(DUPE_SELECT)
      .gte("overall_match", 75)
      .order("overall_match", { ascending: false })
      .limit(limit * 12);

    if (error || !rows?.length) {
      console.warn("getTrendingDupes query failed", error);
      return { dupes: [] };
    }

    const seen = new Set<string>();
    const out: CommunityDupe[] = [];
    for (const r of rows as unknown as DupeJoinRow[]) {
      const m = mapRow(r);
      if (!m) continue;
      const key = `${m.original.brandSlug}/${m.original.productSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
      if (out.length >= limit) break;
    }
    return { dupes: out };
  });

/** Last N scans for the current user — powers "Pick up where you left off". */
export const getRecentScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ limit: z.number().min(1).max(10).optional() }).parse(data))
  .handler(async ({ data, context }): Promise<{ scans: ScanRow[] }> => {
    const limit = data.limit ?? 3;
    const { data: rows, error } = await context.supabase
      .from("scans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("getRecentScans failed", error);
      return { scans: [] };
    }
    return { scans: (rows ?? []) as ScanRow[] };
  });

/** Look up a single community dupe pair by original brand+product slugs.
 *  Used by the read-only community detail route. */
export const getCommunityDupe = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ brandSlug: z.string().min(1), productSlug: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ found: boolean; dupes: CommunityDupe[] }> => {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("brand_slug", data.brandSlug)
      .eq("product_slug", data.productSlug)
      .maybeSingle();

    if (!product) return { found: false, dupes: [] };

    const { data: rows, error } = await supabaseAdmin
      .from("dupes")
      .select(DUPE_SELECT)
      .eq("original_product_id", product.id)
      .order("overall_match", { ascending: false })
      .limit(7);

    if (error) {
      console.warn("getCommunityDupe failed", error);
      return { found: true, dupes: [] };
    }

    const mapped = (rows ?? []).map((r) => mapRow(r as unknown as DupeJoinRow))
      .filter((x): x is CommunityDupe => x !== null);
    return { found: true, dupes: mapped };
  });

// ============================================================
// Per-product detail page
// ============================================================

export type ProductVendor = {
  merchant: string;
  url: string;
  priceUsd: number | null;
  currency: string;
  rank: number;
};

export type ProductDetail = {
  id: string;
  brandSlug: string;
  productSlug: string;
  brand: string;
  productName: string;
  category: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  ingredients: string[];
  ingredientsCount: number | null;
  freeFrom: string[];
  goodFor: string[];
  contains: string[];
  lowestPriceUsd: number | null;
  vendors: ProductVendor[];
  /** Other priced products that are dupes for THIS product. */
  dupesForThis: CommunityDupe[];
  /** Originals where THIS product is listed as a dupe. */
  alsoDupeFor: CommunityDupe[];
};

export const getProductDetail = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ found: boolean; product: ProductDetail | null }> => {
    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select(
        "id, brand_slug, product_slug, brand_name, product_name, category, image_url, source_url, ingredients, ingredients_count, free_from, good_for, contains, lowest_price_usd",
      )
      .eq("id", data.productId)
      .maybeSingle();

    if (prodErr || !product) return { found: false, product: null };

    const [vendorRes, dupesForThisRes, alsoDupeForRes] = await Promise.all([
      supabaseAdmin
        .from("product_vendors")
        .select("merchant, url, price_usd, currency, rank")
        .eq("product_id", product.id)
        .order("price_usd", { ascending: true, nullsFirst: false }),
      supabaseAdmin
        .from("dupes")
        .select(DUPE_SELECT)
        .eq("original_product_id", product.id)
        .order("overall_match", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("dupes")
        .select(DUPE_SELECT)
        .eq("dupe_product_id", product.id)
        .order("overall_match", { ascending: false })
        .limit(20),
    ]);

    const vendors: ProductVendor[] = (vendorRes.data ?? []).map((v) => ({
      merchant: v.merchant,
      url: v.url,
      priceUsd: v.price_usd == null ? null : Number(v.price_usd),
      currency: v.currency,
      rank: v.rank,
    }));

    const dupesForThis = (dupesForThisRes.data ?? [])
      .map((r) => mapRow(r as unknown as DupeJoinRow))
      .filter((x): x is CommunityDupe => x !== null);

    const alsoDupeFor = (alsoDupeForRes.data ?? [])
      .map((r) => mapRow(r as unknown as DupeJoinRow))
      .filter((x): x is CommunityDupe => x !== null);

    return {
      found: true,
      product: {
        id: product.id,
        brandSlug: product.brand_slug,
        productSlug: product.product_slug,
        brand: product.brand_name,
        productName: product.product_name,
        category: product.category,
        imageUrl: product.image_url,
        sourceUrl: product.source_url,
        ingredients: (product.ingredients ?? []) as string[],
        ingredientsCount: product.ingredients_count,
        freeFrom: (product.free_from ?? []) as string[],
        goodFor: (product.good_for ?? []) as string[],
        contains: (product.contains ?? []) as string[],
        lowestPriceUsd:
          product.lowest_price_usd == null ? null : Number(product.lowest_price_usd),
        vendors,
        dupesForThis,
        alsoDupeFor,
      },
    };
  });
