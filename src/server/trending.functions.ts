// Save-driven trending. Falls back to the catalog (Skinsort-mirrored) path
// when there isn't enough save volume yet — that's the cold-start safety net.
//
// Once `trending_saved_dupes(limit:20, p_min_saves:3)` consistently returns
// >= ~12 rows for ~14 days, we can flip MIN_SAVES higher and eventually drop
// the catalog fallback entirely.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getDupeOfTheDay,
  getTrendingDupes,
  type CommunityDupe,
} from "@/server/discover.functions";
import { slugify } from "@/server/skinsort-slugs";

// --- Tunables (no migration needed to change) -----------------------------
const MIN_SAVES = 2;
/** Trending rail uses save-path only if it covers at least this fraction of `limit`. */
const SAVE_PATH_COVERAGE = 0.5;
// --------------------------------------------------------------------------

export type TrendingSource = "saved" | "catalog";

type SavedDupeRow = {
  pair_key: string;
  latest_scan_id: string;
  save_count: number;
  last_saved_at: string;
  original_brand: string;
  original_product_name: string;
  original_image_url: string | null;
  dupe_brand: string | null;
  dupe_product_name: string | null;
  dupe_image_url: string | null;
  match_score: number | null;
  verdict: string | null;
};

/** Adapt a save-aggregated row into the existing CommunityDupe shape so the
 *  UI doesn't have to branch. The `id` is prefixed `saved:<pair_key>:<scanId>`
 *  so card components can route to the public scan view instead of /p/$productId. */
function adaptSavedRow(row: SavedDupeRow): CommunityDupe | null {
  if (!row.dupe_brand || !row.dupe_product_name) return null;
  if (!row.original_image_url || !row.dupe_image_url) return null;
  return {
    id: `saved:${row.pair_key}:${row.latest_scan_id}`,
    overallMatch: row.match_score ?? 0,
    ingredientMatch: null,
    attributeMatch: null,
    sharedIngredientsCount: null,
    rationale: row.verdict,
    original: {
      id: "",
      brandSlug: slugify(row.original_brand),
      productSlug: slugify(row.original_product_name),
      brand: row.original_brand,
      productName: row.original_product_name,
      category: null,
      imageUrl: row.original_image_url,
      lowestPriceUsd: null,
    },
    dupe: {
      id: "",
      brandSlug: slugify(row.dupe_brand),
      productSlug: slugify(row.dupe_product_name),
      brand: row.dupe_brand,
      productName: row.dupe_product_name,
      category: null,
      imageUrl: row.dupe_image_url,
      lowestPriceUsd: null,
    },
  };
}

async function fetchSavedTrending(limit: number): Promise<CommunityDupe[]> {
  const { data, error } = await supabaseAdmin.rpc("trending_saved_dupes", {
    p_limit: limit,
    p_min_saves: MIN_SAVES,
  });
  if (error) {
    console.warn("trending_saved_dupes rpc failed", error);
    return [];
  }
  return ((data ?? []) as SavedDupeRow[])
    .map(adaptSavedRow)
    .filter((x): x is CommunityDupe => x !== null);
}

/** Trending dupes — save-driven when we have signal, catalog otherwise. */
export const getTrendingDupesBlended = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ limit: z.number().min(1).max(50).optional() }).parse(data),
  )
  .handler(
    async ({ data }): Promise<{ dupes: CommunityDupe[]; source: TrendingSource }> => {
      const limit = data.limit ?? 12;
      const saved = await fetchSavedTrending(limit);

      if (saved.length >= Math.ceil(limit * SAVE_PATH_COVERAGE)) {
        return { dupes: saved.slice(0, limit), source: "saved" };
      }

      const catalog = await getTrendingDupes({ data: { limit } });
      return { dupes: catalog.dupes, source: "catalog" };
    },
  );

/** Dupe of the day — prefer save-driven, fall back to catalog. */
export const getDupeOfTheDayBlended = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ dupe: CommunityDupe | null; source: TrendingSource }> => {
    const saved = await fetchSavedTrending(50);
    if (saved.length > 0) {
      const today = new Date();
      const seed =
        today.getUTCFullYear() * 10000 +
        (today.getUTCMonth() + 1) * 100 +
        today.getUTCDate();
      const idx = seed % saved.length;
      return { dupe: saved[idx], source: "saved" };
    }
    const catalog = await getDupeOfTheDay();
    return { dupe: catalog.dupe, source: "catalog" };
  },
);
