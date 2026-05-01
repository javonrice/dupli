// Lovable AI vision: identify a beauty product AND suggest a dupe in one call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20),
});

export type ScannedProduct = {
  productName: string;
  brand: string;
  category: string;
  estimatedPriceUsd: number;
  keyIngredients: string[];
  imageUrl?: string;
};

export type DupeSuggestion = {
  productName: string;
  brand: string;
  category: string;
  estimatedPriceUsd: number;
  whereToBuy: string;
  buyUrl: string;
  keyIngredients: string[];
  imageUrl?: string;
};

export type DupeAnalysis = {
  original: ScannedProduct;
  dupe: DupeSuggestion | null;
  matchScore: number; // 0-100
  verdict: "Worth the hype" | "Mixed" | "Skip" | "No dupe found";
  notes: string;
  bestFor: string[];
  confidence: "high" | "medium" | "low";
  sharedIngredients?: string[];
  uniqueToOriginal?: string[];
  uniqueToDupe?: string[];
  contextMatch?: string;
};

export const scanProduct = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<{ result: DupeAnalysis | null; error: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { result: null, error: "AI is not configured. Please try again later." };
    }

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: [
                "You are an expert licensed esthetician and product analyst.",
                "Step 1: Identify the beauty/skincare product in the image (name, brand, category, typical retail price, key actives).",
                "Step 2: Suggest the single best affordable dupe — a real product, widely available (drugstore, Dollar Tree, Target, Amazon, etc.). Prefer dupes that are meaningfully cheaper.",
                "Step 3: Compare formulas. Populate sharedIngredients (actives present in BOTH formulas), uniqueToOriginal (only in the original), uniqueToDupe (only in the dupe). Use canonical INCI names (e.g. 'Niacinamide', 'Hyaluronic Acid'), 3-6 items per list, prioritize meaningful actives over fillers/water/preservatives, and never repeat the same ingredient across lists.",
                "Step 4: Give a match score (0-100) reflecting how close the actives AND intended effect are.",
                "Step 5: Write contextMatch — ONE sentence explaining WHY this is a real dupe beyond ingredients (skin concern, texture, finish, vibe). Keep distinct from notes.",
                "Step 6: Give an honest esthetician verdict and short notes.",
                "If you genuinely cannot find a credible dupe, set dupe to null, verdict to 'No dupe found', and leave the comparison lists empty.",
                "Always call the analyze_dupe tool exactly once. Never invent a fake brand.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Identify this product and find the best affordable dupe." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "analyze_dupe",
                description: "Return the identified product and the best affordable dupe.",
                parameters: {
                  type: "object",
                  properties: {
                    original: {
                      type: "object",
                      properties: {
                        productName: { type: "string" },
                        brand: { type: "string" },
                        category: { type: "string", description: "e.g. Serum, Face Mist, Eye Cream, Moisturizer, Mask, Cleanser, Lipstick" },
                        estimatedPriceUsd: { type: "number", description: "Approximate retail price in USD" },
                        keyIngredients: { type: "array", items: { type: "string" }, description: "3-6 key actives" },
                      },
                      required: ["productName", "brand", "category", "estimatedPriceUsd", "keyIngredients"],
                      additionalProperties: false,
                    },
                    dupe: {
                      anyOf: [
                        {
                          type: "object",
                          properties: {
                            productName: { type: "string" },
                            brand: { type: "string" },
                            category: { type: "string" },
                            estimatedPriceUsd: { type: "number" },
                            whereToBuy: { type: "string", description: "Retailer name, e.g. Dollar Tree, Target, Amazon, CVS" },
                            buyUrl: { type: "string", description: "A direct, working URL where the user can buy or view the dupe. Prefer the retailer's product page. If a precise product page URL isn't known, use a retailer search URL such as https://www.amazon.com/s?k=<product+name+brand> or https://www.target.com/s?searchTerm=<product+name+brand>. Always return a valid https URL." },
                            keyIngredients: { type: "array", items: { type: "string" } },
                          },
                          required: ["productName", "brand", "category", "estimatedPriceUsd", "whereToBuy", "buyUrl", "keyIngredients"],
                          additionalProperties: false,
                        },
                        { type: "null" },
                      ],
                    },
                    matchScore: { type: "number", minimum: 0, maximum: 100 },
                    verdict: { type: "string", enum: ["Worth the hype", "Mixed", "Skip", "No dupe found"] },
                    notes: { type: "string", description: "1-2 sentences from a licensed esthetician's perspective." },
                    bestFor: { type: "array", items: { type: "string" }, description: "2-4 short use-case tags, e.g. 'Anti-aging', 'Dry skin'." },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    sharedIngredients: { type: "array", items: { type: "string" }, description: "Active ingredients present in BOTH formulas (canonical INCI names, 0-6 items). Empty array if no dupe." },
                    uniqueToOriginal: { type: "array", items: { type: "string" }, description: "Notable actives only in the original (canonical INCI, 0-6 items). Empty array if no dupe." },
                    uniqueToDupe: { type: "array", items: { type: "string" }, description: "Notable actives only in the dupe (canonical INCI, 0-6 items). Empty array if no dupe." },
                    contextMatch: { type: "string", description: "ONE sentence on WHY these match beyond ingredients (skin concern, texture, finish). Empty string if no dupe." },
                  },
                  required: ["original", "dupe", "matchScore", "verdict", "notes", "bestFor", "confidence", "sharedIngredients", "uniqueToOriginal", "uniqueToDupe", "contextMatch"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "analyze_dupe" } },
        }),
      });

      if (res.status === 429) {
        return { result: null, error: "We're getting a lot of scans right now — try again in a minute." };
      }
      if (res.status === 402) {
        return { result: null, error: "AI credits exhausted. Please add credits to continue." };
      }
      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        return { result: null, error: "Couldn't analyze the photo. Please try another angle." };
      }

      const json = await res.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const argsRaw = toolCall?.function?.arguments;
      if (!argsRaw) {
        return { result: null, error: "Couldn't read the product. Try a clearer, well-lit photo." };
      }
      const parsed = JSON.parse(argsRaw) as DupeAnalysis;

      // Best-effort: enrich both the original and the dupe with real product photos in parallel.
      const [originalImg, dupeImg] = await Promise.all([
        parsed.original ? findProductImage(parsed.original.brand, parsed.original.productName) : Promise.resolve(undefined),
        parsed.dupe ? findProductImage(parsed.dupe.brand, parsed.dupe.productName) : Promise.resolve(undefined),
      ]);
      if (originalImg && parsed.original) parsed.original.imageUrl = originalImg;
      if (dupeImg && parsed.dupe) parsed.dupe.imageUrl = dupeImg;

      return { result: parsed, error: null };
    } catch (e) {
      console.error("scanProduct failed", e);
      return { result: null, error: "Something went wrong. Please try again." };
    }
  });

/**
 * Best-effort product image lookup using DuckDuckGo's image search.
 * DuckDuckGo exposes a lightweight JSON endpoint that's reliable from a server
 * (Google's image search aggressively blocks/obfuscates non-browser requests).
 * Returns undefined on any failure so a missing image never breaks the scan.
 */
async function findProductImage(brand: string, productName: string): Promise<string | undefined> {
  const query = `${brand} ${productName}`.trim();
  console.log("[findProductImage] looking up:", query);
  try {
    // Step 1: hit the HTML endpoint to get a `vqd` token (required by DDG).
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
    );
    if (!tokenRes.ok) {
      console.warn("[findProductImage] token fetch failed", tokenRes.status);
      return undefined;
    }
    const tokenHtml = await tokenRes.text();
    const vqdMatch =
      tokenHtml.match(/vqd=([\d-]+)\&/) ||
      tokenHtml.match(/vqd="([\d-]+)"/) ||
      tokenHtml.match(/vqd=([\d-]+)/);
    const vqd = vqdMatch?.[1];
    if (!vqd) {
      console.warn("[findProductImage] no vqd token in response");
      return undefined;
    }

    // Step 2: call the JSON image endpoint with the token.
    const apiUrl =
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}` +
      `&vqd=${vqd}&f=,,,,,&p=1`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://duckduckgo.com/",
      },
    });
    if (!apiRes.ok) {
      console.warn("[findProductImage] api fetch failed", apiRes.status);
      return undefined;
    }
    const data = (await apiRes.json()) as {
      results?: Array<{ image?: string; url?: string; source?: string; title?: string; width?: number; height?: number }>;
    };
    const candidates = (data.results ?? []).filter(
      (r) => r.image && /^https?:\/\//i.test(r.image),
    );
    if (candidates.length === 0) {
      console.warn("[findProductImage] no image results");
      return undefined;
    }

    const best = pickBestProductImage(candidates, brand, productName);
    console.log("[findProductImage] found:", best.image, "score:", best.score, "from:", best.url ?? best.source);
    return best.image;
  } catch (e) {
    console.warn("[findProductImage] failed", e);
    return undefined;
  }
}

/**
 * Rank image results to prefer real retailer / brand storefront product pages
 * over generic blog thumbnails, Pinterest pins, marketplace listings, etc.
 */
function pickBestProductImage(
  results: Array<{ image?: string; url?: string; source?: string; title?: string; width?: number; height?: number }>,
  brand: string,
  productName: string,
): { image: string; score: number; url?: string; source?: string } {
  // Trusted beauty/skincare retailers + general retailers that typically host
  // clean, on-white product photography on real product pages.
  const RETAILER_DOMAINS = [
    "sephora.com", "ulta.com", "target.com", "walmart.com", "amazon.com",
    "cvs.com", "walgreens.com", "riteaid.com", "dollartree.com", "dollargeneral.com",
    "boots.com", "lookfantastic.com", "cultbeauty.com", "spacenk.com", "beautylish.com",
    "dermstore.com", "skinstore.com", "bluemercury.com", "credobeauty.com",
    "nordstrom.com", "macys.com", "bloomingdales.com", "saksfifthavenue.com",
    "costco.com", "samsclub.com", "kohls.com", "thebay.com",
  ];
  // Sources that usually serve cropped/low-quality thumbnails or unrelated lifestyle shots.
  const PENALIZED_DOMAINS = [
    "pinterest.", "lookaside.fbsbx.com", "fbcdn.net", "instagram.com", "cdninstagram.com",
    "tiktok.com", "tiktokcdn.com", "youtube.com", "ytimg.com", "reddit.com", "redd.it",
    "ebay.com", "ebayimg.com", "etsy.com", "poshmark.com", "mercari.com", "depop.com",
    "aliexpress.com", "alicdn.com", "wish.com", "dhgate.com",
  ];

  const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const productTokens = productName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  const hostOf = (u?: string) => {
    if (!u) return "";
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return "";
    }
  };

  let best: { image: string; score: number; url?: string; source?: string } = {
    image: results[0].image!,
    score: -Infinity,
    url: results[0].url,
    source: results[0].source,
  };

  for (const r of results) {
    if (!r.image) continue;
    const pageHost = hostOf(r.url);
    const imgHost = hostOf(r.image);
    const combined = `${pageHost} ${imgHost} ${(r.url ?? "").toLowerCase()} ${(r.title ?? "").toLowerCase()}`;
    let score = 0;

    // Strong preference: result page is on a known retailer.
    if (RETAILER_DOMAINS.some((d) => pageHost.endsWith(d))) score += 50;
    // Image itself served from a retailer CDN.
    if (RETAILER_DOMAINS.some((d) => imgHost.endsWith(d) || imgHost.includes(d.replace(".com", "")))) score += 20;
    // Brand's own storefront (e.g. cerave.com, theordinary.com).
    if (brandSlug.length >= 4 && pageHost.includes(brandSlug)) score += 40;
    if (brandSlug.length >= 4 && imgHost.includes(brandSlug)) score += 15;
    // URL path hints we're on a real product page, not a blog/listicle.
    if (/\/(p|product|products|prod|item|dp|ip)[\/-]/i.test(r.url ?? "")) score += 25;
    // Image filename hints at product photography.
    if (/(product|packshot|pdp|hero|main|front)/i.test(r.image)) score += 8;

    // Penalize known low-quality / unrelated sources.
    if (PENALIZED_DOMAINS.some((d) => pageHost.includes(d) || imgHost.includes(d))) score -= 60;
    // Penalize obvious thumbnails.
    if (/(thumb|thumbnail|_t\.|_sm\.|-small|150x|200x|300x)/i.test(r.image)) score -= 15;

    // Favor larger images.
    if (typeof r.width === "number" && typeof r.height === "number") {
      const px = r.width * r.height;
      if (px >= 600 * 600) score += 10;
      if (px >= 1000 * 1000) score += 8;
      if (px < 250 * 250) score -= 20;
      const ratio = r.width / r.height;
      if (ratio > 0.8 && ratio < 1.25) score += 5;
    }

    // Reward token overlap with the product name.
    const matched = productTokens.filter((t) => combined.includes(t)).length;
    score += matched * 3;

    if (score > best.score) {
      best = { image: r.image, score, url: r.url, source: r.source };
    }
  }

  return best;
}
