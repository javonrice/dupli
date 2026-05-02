// Dupe DB lookup: read the local mirror first, fall back to AI in scan.functions.ts.
// Also enqueues unknown products for background ingestion.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "./skinsort-slugs";

export type LocalDupeHit = {
  productName: string;
  brand: string;
  category: string | null;
  imageUrl: string | null;
  overallMatch: number;
  ingredientMatch: number | null;
  attributeMatch: number | null;
  sharedIngredientsCount: number | null;
  rationale: string | null;
  freeFrom: string[];
  goodFor: string[];
  contains: string[];
};

export type LookupDupesResult = {
  found: boolean;
  product?: {
    brand: string;
    productName: string;
    category: string | null;
    imageUrl: string | null;
    freeFrom: string[];
    goodFor: string[];
    contains: string[];
  };
  topDupes: LocalDupeHit[];
};

const InputSchema = z.object({
  brand: z.string().min(1).max(200),
  productName: z.string().min(1).max(300),
});

export const lookupDupes = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<LookupDupesResult> => {
    const brandSlug = slugify(data.brand);
    const productSlug = slugify(data.productName);

    // 1. Try exact slug match.
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, brand_name, product_name, category, image_url, free_from, good_for, contains")
      .eq("brand_slug", brandSlug)
      .eq("product_slug", productSlug)
      .maybeSingle();

    if (!product) {
      // Enqueue and return empty.
      await enqueueProduct(brandSlug, productSlug, "user_scan_miss", 10);
      return { found: false, topDupes: [] };
    }

    // 2. Pull top dupes for this product.
    const { data: dupeRows } = await supabaseAdmin
      .from("dupes")
      .select(
        `overall_match, ingredient_match, attribute_match, shared_ingredients_count, rationale,
         dupe:dupe_product_id ( brand_name, product_name, category, image_url, free_from, good_for, contains )`,
      )
      .eq("original_product_id", product.id)
      .order("overall_match", { ascending: false })
      .limit(10);

    const topDupes: LocalDupeHit[] = (dupeRows ?? [])
      .map((row) => {
        const d = row.dupe as {
          brand_name: string;
          product_name: string;
          category: string | null;
          image_url: string | null;
          free_from: string[] | null;
          good_for: string[] | null;
          contains: string[] | null;
        } | null;
        if (!d) return null;
        return {
          brand: d.brand_name,
          productName: d.product_name,
          category: d.category,
          imageUrl: d.image_url,
          overallMatch: row.overall_match,
          ingredientMatch: row.ingredient_match,
          attributeMatch: row.attribute_match,
          sharedIngredientsCount: row.shared_ingredients_count,
          rationale: row.rationale,
          freeFrom: d.free_from ?? [],
          goodFor: d.good_for ?? [],
          contains: d.contains ?? [],
        } satisfies LocalDupeHit;
      })
      .filter((x): x is LocalDupeHit => x !== null);

    return {
      found: true,
      product: {
        brand: product.brand_name,
        productName: product.product_name,
        category: product.category,
        imageUrl: product.image_url,
        freeFrom: product.free_from ?? [],
        goodFor: product.good_for ?? [],
        contains: product.contains ?? [],
      },
      topDupes,
    };
  });

async function enqueueProduct(
  brandSlug: string,
  productSlug: string | null,
  reason: "seed" | "user_scan_miss" | "refresh",
  priority: number,
) {
  // Best-effort. Conflict on (brand_slug, product_slug) where status='pending' is silent.
  await supabaseAdmin.from("ingestion_queue").insert({
    brand_slug: brandSlug,
    product_slug: productSlug,
    reason,
    priority,
  });
}
