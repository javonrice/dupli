// Server-only product link resolver.
// Goal: turn AI-returned (brand, productName) into REAL, verified buyable URLs.
//
// Pipeline (stop at first step that produces results):
//   1. product_link_cache lookup (30-day TTL)
//   2. DuckDuckGo / Bing web search filtered to a retailer allowlist + URL verify
//   3. Skinsort product_vendors enrichment (only for products we've ingested)
//   4. Caller falls back to retailer search URLs (handled in retailer-links.ts)
//
// Latency is hard-capped per call so a slow retailer never blocks the scan.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "@/lib/skinsort-slugs";

export type ProductLink = {
  merchant: string;
  url: string;
  priceUsd: number | null;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PER_PRODUCT_BUDGET_MS = 2500;
const VERIFY_TIMEOUT_MS = 4000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// host substring -> normalized merchant label
const RETAILER_ALLOWLIST: Array<{ host: RegExp; label: string }> = [
  { host: /(^|\.)amazon\.com$/i, label: "Amazon" },
  { host: /(^|\.)target\.com$/i, label: "Target" },
  { host: /(^|\.)walmart\.com$/i, label: "Walmart" },
  { host: /(^|\.)ulta\.com$/i, label: "Ulta" },
  { host: /(^|\.)sephora\.com$/i, label: "Sephora" },
  { host: /(^|\.)cvs\.com$/i, label: "CVS" },
  { host: /(^|\.)walgreens\.com$/i, label: "Walgreens" },
  { host: /(^|\.)sallybeauty\.com$/i, label: "Sally Beauty" },
  { host: /(^|\.)dollartree\.com$/i, label: "Dollar Tree" },
  { host: /(^|\.)dollargeneral\.com$/i, label: "Dollar General" },
  { host: /(^|\.)costco\.com$/i, label: "Costco" },
  { host: /(^|\.)kohls\.com$/i, label: "Kohl's" },
  { host: /(^|\.)bedbathandbeyond\.com$/i, label: "Bed Bath & Beyond" },
];

function matchRetailer(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    for (const r of RETAILER_ALLOWLIST) {
      if (r.host.test(u.hostname)) return r.label;
    }
    return null;
  } catch {
    return null;
  }
}

function isProductPath(urlStr: string): boolean {
  // Filter out obvious search/category/help pages — we want product detail pages.
  try {
    const path = new URL(urlStr).pathname.toLowerCase();
    if (
      /\/(search|s\/|c\/|help|customer-service|account|cart|checkout|gp\/help|gp\/css)\b/.test(
        path,
      )
    ) {
      return false;
    }
    return path.length > 1; // not just "/"
  } catch {
    return false;
  }
}

type SearchHit = { url: string; title: string };

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      4000,
    );
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    // DDG html version uses <a class="result__a" href="...">title</a>
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      let href = m[1];
      // DDG sometimes wraps with /l/?uddg=<encoded>
      if (href.startsWith("//")) href = "https:" + href;
      try {
        const parsed = new URL(href, "https://duckduckgo.com");
        const uddg = parsed.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      } catch {
        // ignore
      }
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      hits.push({ url: href, title });
      if (hits.length >= 25) break;
    }
    return hits;
  } catch (e) {
    console.warn("[productLinks] ddg failed", e);
    return [];
  }
}

async function searchBing(query: string): Promise<SearchHit[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      4000,
    );
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    // Bing organic results: <li class="b_algo"> ... <h2><a href="...">Title</a></h2>
    const re = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (/^https?:\/\//i.test(href)) {
        hits.push({ url: href, title });
        if (hits.length >= 25) break;
      }
    }
    return hits;
  } catch (e) {
    console.warn("[productLinks] bing failed", e);
    return [];
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Range: "bytes=0-0",
        },
      },
      VERIFY_TIMEOUT_MS,
    );
    // Accept anything that isn't a hard 404/410/5xx — many retailers return
    // 403 to bot-like requests but the URL is still valid.
    if (res.status === 404 || res.status === 410) return false;
    if (res.status >= 500) return false;
    // Verify final URL is still on an allowlisted host (defends against redirects to login/error pages).
    if (!matchRetailer(res.url || url)) return false;
    return true;
  } catch {
    // Network errors / aborts — treat as unverified rather than poisoning the cache.
    return false;
  }
}

async function searchAndVerify(brand: string, productName: string): Promise<ProductLink[]> {
  const query = `${brand} ${productName} buy`.trim();
  const [ddg, bing] = await Promise.all([searchDuckDuckGo(query), searchBing(query)]);
  const all = [...ddg, ...bing];

  // Dedupe by retailer host, keep first match per retailer.
  const perMerchant = new Map<string, SearchHit>();
  for (const hit of all) {
    const merchant = matchRetailer(hit.url);
    if (!merchant) continue;
    if (!isProductPath(hit.url)) continue;
    if (!perMerchant.has(merchant)) perMerchant.set(merchant, hit);
    if (perMerchant.size >= 4) break;
  }
  if (perMerchant.size === 0) return [];

  // Verify in parallel; keep only those that respond.
  const verified = await Promise.all(
    Array.from(perMerchant.entries()).map(async ([merchant, hit]) => {
      const ok = await verifyUrl(hit.url);
      return ok ? { merchant, url: hit.url, priceUsd: null as number | null } : null;
    }),
  );
  return verified.filter((v): v is ProductLink => v !== null).slice(0, 3);
}

async function loadFromCache(brandSlug: string, productSlug: string): Promise<ProductLink[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("product_link_cache")
      .select("vendors, resolved_at")
      .eq("brand_slug", brandSlug)
      .eq("product_slug", productSlug)
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - new Date(data.resolved_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    const vendors = (data.vendors ?? []) as ProductLink[];
    return Array.isArray(vendors) && vendors.length > 0 ? vendors : null;
  } catch {
    return null;
  }
}

async function saveToCache(
  brandSlug: string,
  productSlug: string,
  vendors: ProductLink[],
  source: string,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("product_link_cache")
      .upsert(
        [
          {
            brand_slug: brandSlug,
            product_slug: productSlug,
            vendors: vendors as unknown as import("@/integrations/supabase/types").Json,
            source,
            resolved_at: new Date().toISOString(),
          },
        ],
        { onConflict: "brand_slug,product_slug" },
      );
  } catch (e) {
    console.warn("[productLinks] cache write failed", e);
  }
}

async function loadSkinsortVendors(
  brandSlug: string,
  productSlug: string,
): Promise<ProductLink[]> {
  try {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("brand_slug", brandSlug)
      .eq("product_slug", productSlug)
      .maybeSingle();
    if (!product) return [];
    const { data: vendors } = await supabaseAdmin
      .from("product_vendors")
      .select("merchant, url, price_usd")
      .eq("product_id", product.id)
      .order("price_usd", { ascending: true, nullsFirst: false })
      .limit(5);
    return (vendors ?? []).map((v) => ({
      merchant: v.merchant,
      url: v.url,
      priceUsd: v.price_usd == null ? null : Number(v.price_usd),
    }));
  } catch {
    return [];
  }
}

function mergeVendors(primary: ProductLink[], extra: ProductLink[]): ProductLink[] {
  const seen = new Set(primary.map((v) => v.merchant.toLowerCase()));
  const merged = [...primary];
  for (const v of extra) {
    if (seen.has(v.merchant.toLowerCase())) continue;
    merged.push(v);
    seen.add(v.merchant.toLowerCase());
  }
  // Cheapest first when prices known, then unpriced last.
  return merged
    .sort((a, b) => {
      if (a.priceUsd == null && b.priceUsd == null) return 0;
      if (a.priceUsd == null) return 1;
      if (b.priceUsd == null) return -1;
      return a.priceUsd - b.priceUsd;
    })
    .slice(0, 5);
}

/** Resolve verified buyable links for one product. Always returns an array (possibly empty). */
export async function resolveProductLinks(
  brand: string | null | undefined,
  productName: string | null | undefined,
): Promise<ProductLink[]> {
  const b = (brand ?? "").trim();
  const n = (productName ?? "").trim();
  if (!b || !n) return [];

  const brandSlug = slugify(b);
  const productSlug = slugify(n);
  if (!brandSlug || !productSlug) return [];

  // 1. Cache
  const cached = await loadFromCache(brandSlug, productSlug);
  if (cached) return cached;

  // 2 + 3 in parallel under a hard time budget
  const work = (async () => {
    const [searched, skinsort] = await Promise.all([
      searchAndVerify(b, n).catch(() => [] as ProductLink[]),
      loadSkinsortVendors(brandSlug, productSlug).catch(() => [] as ProductLink[]),
    ]);
    return mergeVendors(searched, skinsort);
  })();

  const timeout = new Promise<ProductLink[]>((resolve) =>
    setTimeout(() => resolve([]), PER_PRODUCT_BUDGET_MS),
  );

  const result = await Promise.race([work, timeout]);

  // Only cache real results — don't poison the cache with empty fallbacks.
  if (result.length > 0) {
    void saveToCache(brandSlug, productSlug, result, "web-search");
  }

  return result;
}
