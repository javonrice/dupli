// On-demand SkinSort scraper. Pulls real ingredient lists and real retailer
// prices from public SkinSort pages, caches them in our DB, and serves them
// back on subsequent scans without hitting the network. Server-only.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseSkinsortVendors, type ParsedVendor } from "./skinsort-parser";

const PRODUCT_URL = (brandSlug: string, productSlug: string) =>
  `https://skinsort.com/products/${brandSlug}/${productSlug}`;
const VENDORS_URL = (brandSlug: string, productSlug: string) =>
  `https://skinsort.com/products/${brandSlug}/${productSlug}/us/vendors`;

const FETCH_TIMEOUT_MS = 8000;
const PRICE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Per-worker concurrency limiter so we don't hammer SkinSort under bursty traffic.
let inflight = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 4;

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inflight += 1;
  try {
    return await fn();
  } finally {
    inflight -= 1;
    const next = queue.shift();
    if (next) next();
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DupliBot/1.0; +https://dupli.lovable.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Pull the in-document INCI list using the same selector logic as the parser.
// Imported here as a private helper rather than via parseSkinsortPage because
// product-only pages may not have any dupes (parseSkinsortPage returns null
// in that case) and we still want their ingredients.
function extractIngredients(html: string): string[] {
  const start = html.indexOf('id="ingredients_list"');
  if (start < 0) return [];
  const slice = html.slice(start, start + 60_000);
  const out: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<a[^>]+href="\/ingredients\/[a-z0-9-]+"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(slice)) !== null) {
    const inner = m[1];
    const nameMatch =
      inner.match(/>\s*([^<>]{1,80}?)\s*</) ||
      inner.match(/^\s*([^<>\n]{1,80}?)\s*$/);
    const raw = nameMatch ? nameMatch[1] : inner.replace(/<[^>]+>/g, " ");
    const name = raw
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 80) break;
  }
  return out;
}

export type EnrichedProductData = {
  ingredients: string[];
  vendors: ParsedVendor[];
};

/**
 * Make sure a product row has fresh ingredients + vendor prices, fetching
 * SkinSort once and writing the results back to our DB. Returns the enriched
 * data. Never throws — failures are logged and an empty payload is returned
 * so the caller can fall back gracefully.
 */
export async function ensureProductData(
  productId: string,
): Promise<EnrichedProductData> {
  try {
    const { data: row } = await supabaseAdmin
      .from("products")
      .select(
        "id, brand_slug, product_slug, ingredients, last_priced_at, source_url",
      )
      .eq("id", productId)
      .maybeSingle();

    if (!row) return { ingredients: [], vendors: [] };

    const needIngredients =
      !row.ingredients || (row.ingredients as string[]).length === 0;
    const lastPriced = row.last_priced_at ? Date.parse(row.last_priced_at) : 0;
    const needVendors = !lastPriced || Date.now() - lastPriced > PRICE_TTL_MS;

    let ingredients: string[] = (row.ingredients as string[]) ?? [];
    let vendors: ParsedVendor[] = [];

    // Always try to read currently-cached vendors first so we have something to
    // return even if we don't refetch (within TTL) or refetch fails.
    const { data: cachedVendors } = await supabaseAdmin
      .from("product_vendors")
      .select("merchant, url, price_usd, currency, rank")
      .eq("product_id", productId)
      .order("rank", { ascending: true });
    vendors = (cachedVendors ?? []).map((v) => ({
      merchant: v.merchant,
      url: v.url,
      priceUsd: v.price_usd != null ? Number(v.price_usd) : null,
      currency: v.currency ?? "USD",
      rank: v.rank ?? 0,
    }));

    if (!needIngredients && !needVendors) {
      return { ingredients, vendors };
    }

    await withSlot(async () => {
      // 1. Fetch product HTML for ingredients (only if missing).
      if (needIngredients) {
        const html = await fetchHtml(
          PRODUCT_URL(row.brand_slug, row.product_slug),
        );
        if (html) {
          const parsed = extractIngredients(html);
          if (parsed.length > 0) {
            ingredients = parsed;
            await supabaseAdmin
              .from("products")
              .update({ ingredients: parsed })
              .eq("id", productId);
          }
        }
      }

      // 2. Fetch vendors HTML for prices (only if stale).
      if (needVendors) {
        const html = await fetchHtml(
          VENDORS_URL(row.brand_slug, row.product_slug),
        );
        if (html) {
          const parsed = parseSkinsortVendors(html);
          if (parsed.length > 0) {
            // Replace cached vendor set atomically (delete then insert).
            await supabaseAdmin
              .from("product_vendors")
              .delete()
              .eq("product_id", productId);
            const rows = parsed.map((v) => ({
              product_id: productId,
              merchant: v.merchant,
              url: v.url,
              price_usd: v.priceUsd,
              currency: v.currency,
              rank: v.rank,
            }));
            await supabaseAdmin.from("product_vendors").insert(rows);
            vendors = parsed;
          }
          // Always bump last_priced_at so we don't retry every scan when a
          // product genuinely has no vendors listed.
          await supabaseAdmin
            .from("products")
            .update({ last_priced_at: new Date().toISOString() })
            .eq("id", productId);
        }
      }
    });

    return { ingredients, vendors };
  } catch (err) {
    console.warn("[skinsort-scraper] ensureProductData failed:", err);
    return { ingredients: [], vendors: [] };
  }
}

const STOP_INGREDIENTS = new Set([
  "water",
  "aqua",
  "aqua/water",
  "aqua (water)",
  "fragrance",
  "parfum",
  "parfum (fragrance)",
  "phenoxyethanol",
  "ethylhexylglycerin",
  "disodium edta",
  "edta",
  "tetrasodium edta",
  "citric acid",
  "sodium hydroxide",
  "sodium chloride",
  "potassium sorbate",
  "sodium benzoate",
]);

function normalizeIng(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2019']/g, "")
    .trim();
}

/**
 * Compute a meaningful ingredient diff between two real INCI lists.
 * Returns shared (intersection minus boring fillers), unique to each side.
 * Each list is capped to ~6 most "front-of-label" items (earlier in the
 * INCI list = higher concentration in the formula).
 */
export function diffIngredientLists(
  originalList: string[],
  dupeList: string[],
): {
  sharedIngredients: string[];
  uniqueToOriginal: string[];
  uniqueToDupe: string[];
} {
  const orig = originalList.map(normalizeIng);
  const dupe = dupeList.map(normalizeIng);
  const origSet = new Set(orig);
  const dupeSet = new Set(dupe);

  // Pretty-print map: keep the first-seen original casing.
  const pretty = new Map<string, string>();
  originalList.forEach((n, i) => {
    if (!pretty.has(orig[i])) pretty.set(orig[i], n);
  });
  dupeList.forEach((n, i) => {
    if (!pretty.has(dupe[i])) pretty.set(dupe[i], n);
  });

  const shared: string[] = [];
  // Walk the original list in order so highest-concentration shared
  // ingredients come first.
  for (const k of orig) {
    if (!dupeSet.has(k)) continue;
    if (STOP_INGREDIENTS.has(k)) continue;
    if (shared.includes(pretty.get(k) ?? k)) continue;
    shared.push(pretty.get(k) ?? k);
    if (shared.length >= 6) break;
  }

  const onlyOrig: string[] = [];
  for (const k of orig) {
    if (dupeSet.has(k)) continue;
    if (STOP_INGREDIENTS.has(k)) continue;
    const label = pretty.get(k) ?? k;
    if (onlyOrig.includes(label)) continue;
    onlyOrig.push(label);
    if (onlyOrig.length >= 6) break;
  }

  const onlyDupe: string[] = [];
  for (const k of dupe) {
    if (origSet.has(k)) continue;
    if (STOP_INGREDIENTS.has(k)) continue;
    const label = pretty.get(k) ?? k;
    if (onlyDupe.includes(label)) continue;
    onlyDupe.push(label);
    if (onlyDupe.length >= 6) break;
  }

  return {
    sharedIngredients: shared,
    uniqueToOriginal: onlyOrig,
    uniqueToDupe: onlyDupe,
  };
}
