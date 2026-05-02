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
  verdict: "Worth the hype" | "Mixed" | "Skip" | "Risky dupe" | "No dupe found";
  notes: string;
  bestFor: string[];
  confidence: "high" | "medium" | "low";
  sharedIngredients?: string[];
  uniqueToOriginal?: string[];
  uniqueToDupe?: string[];
  contextMatch?: string;
  // New: lookalike + risk dimensions
  dupeType?: "Lookalike packaging" | "Formula dupe" | "Both" | "Neither";
  packagingSimilarity?: number; // 0-100 — how much the dupe's packaging mimics the original
  riskLevel?: "Lower risk" | "Comparable" | "Higher risk";
  riskFactors?: string[]; // specific concerns introduced by the dupe
  missingActives?: string[]; // actives the original has that the dupe drops
  safetyNote?: string; // one plain-English esthetician sentence
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
                "You are a practical beauty dupe scanner. A shopper may scan a name-brand product, an affordable lookalike, or a normal product that simply needs a lower-cost alternative.",
                "Dupe culture is about TWO things, not just price:",
                "(a) LOOKALIKE PACKAGING — the cheap product is intentionally designed to mimic a name brand (color palette, bottle shape, font, label layout). Treat visual mimicry as a first-class signal. If the photo shows an obvious lookalike (e.g. an XtraCare body balm copying Vaseline, a Dermasil tube copying Summer Fridays, an XtraCare cleanser saying 'Compare to Neutrogena'), the dupe IS that name brand even when the price gap is small.",
                "(b) FORMULA — does the cheaper product actually deliver the same actives at usable percentages, or does it strip them out / swap in cheaper, riskier substitutes?",
                "Step 1: Identify the product in the image (name, brand, category, typical retail price, key actives).",
                "Step 2: If the scanned item is affordable/lookalike, identify the name-brand counterpart. If the scanned item is name-brand, identify a credible affordable dupe. If no clear lookalike exists, pick the closest formula/use-case alternative. Always provide a buyUrl (retailer product page, or a retailer search URL).",
                "Step 3: Set dupeType: 'Lookalike packaging' (visual copy, formula differs), 'Formula dupe' (formula matches but packaging is its own thing), 'Both', or 'Neither'.",
                "Step 4: Score packagingSimilarity 0-100 honestly based on color, shape, typography, label layout. A bottle that just shares a color gets ~30; a near-clone with matching font and silhouette gets 85+.",
                "Step 5: Compare formulas. sharedIngredients (actives in BOTH), uniqueToOriginal (only original), uniqueToDupe (only dupe). Use canonical INCI names, 0-6 per list, never repeat across lists, prioritize meaningful actives over water/fillers.",
                "Step 6: matchScore 0-100 based on how close the actives AND intended effect are.",
                "Step 7: Assess RISK of switching to the dupe. Set riskLevel:",
                "  - 'Lower risk' = dupe is gentler / fewer irritants than original",
                "  - 'Comparable' = roughly equivalent safety profile",
                "  - 'Higher risk' = dupe introduces irritants the original avoided (added fragrance, denatured alcohol high in INCI, unbuffered acids, mislabeled SPF, harsh sulfates in a sensitive-skin category, etc.)",
                "Step 8: Populate riskFactors with 0-4 SHORT specific concerns about the dupe ('Added fragrance', 'Denatured alcohol high in INCI', 'No SPF despite mimicking a sunscreen', 'Glycolic acid without buffering'). Empty if no concerns.",
                "Step 9: Populate missingActives — 0-4 ingredients the ORIGINAL has that the dupe drops (what the user gives up). Empty if nothing meaningful is lost.",
                "Step 10: safetyNote = ONE plain-English sentence an esthetician would say out loud about who/where this is OK to use ('Fine for body, I wouldn't put this on a compromised face barrier.').",
                "Step 11: contextMatch = ONE sentence on WHY these match beyond ingredients (skin concern, texture, finish). Distinct from notes and safetyNote.",
                "Step 12: Verdict — be honest, never inflate:",
                "  - 'Worth the hype' = credible swap, comparable or lower risk",
                "  - 'Mixed' = some tradeoffs but defensible for the right user",
                "  - 'Risky dupe' = clearly cheaper / lookalike but the formula tradeoff is bad enough we should warn the user",
                "  - 'Skip' = not a real dupe, or actively worse in ways that matter",
                "  - 'No dupe found' = no credible counterpart exists",
                "If you genuinely cannot find a credible dupe, set dupe to null, verdict 'No dupe found', and leave comparison/risk lists empty.",
                "Always call analyze_dupe exactly once. Never invent a fake brand, but do not fail just because the product is ordinary — give the best practical comparison you can.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Identify this product, find the best dupe/counterpart for a normal shopper, and tell me whether the swap is safe.",
                },
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
                        category: {
                          type: "string",
                          description:
                            "e.g. Serum, Face Mist, Eye Cream, Moisturizer, Mask, Cleanser, Lipstick",
                        },
                        estimatedPriceUsd: {
                          type: "number",
                          description: "Approximate retail price in USD",
                        },
                        keyIngredients: {
                          type: "array",
                          items: { type: "string" },
                          description: "3-6 key actives",
                        },
                      },
                      required: [
                        "productName",
                        "brand",
                        "category",
                        "estimatedPriceUsd",
                        "keyIngredients",
                      ],
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
                            whereToBuy: {
                              type: "string",
                              description: "Retailer name, e.g. Dollar Tree, Target, Amazon, CVS",
                            },
                            buyUrl: {
                              type: "string",
                              description:
                                "A direct, working URL where the user can buy or view the dupe. Prefer the retailer's product page. If a precise product page URL isn't known, use a retailer search URL such as https://www.amazon.com/s?k=<product+name+brand> or https://www.target.com/s?searchTerm=<product+name+brand>. Always return a valid https URL.",
                            },
                            keyIngredients: { type: "array", items: { type: "string" } },
                          },
                          required: [
                            "productName",
                            "brand",
                            "category",
                            "estimatedPriceUsd",
                            "whereToBuy",
                            "buyUrl",
                            "keyIngredients",
                          ],
                          additionalProperties: false,
                        },
                        { type: "null" },
                      ],
                    },
                    matchScore: { type: "number", minimum: 0, maximum: 100 },
                    verdict: {
                      type: "string",
                      enum: ["Worth the hype", "Mixed", "Skip", "Risky dupe", "No dupe found"],
                    },
                    notes: {
                      type: "string",
                      description: "1-2 sentences from a licensed esthetician's perspective.",
                    },
                    bestFor: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-4 short use-case tags, e.g. 'Anti-aging', 'Dry skin'.",
                    },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    sharedIngredients: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Active ingredients present in BOTH formulas (canonical INCI names, 0-6 items). Empty array if no dupe.",
                    },
                    uniqueToOriginal: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Notable actives only in the original (canonical INCI, 0-6 items). Empty array if no dupe.",
                    },
                    uniqueToDupe: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Notable actives only in the dupe (canonical INCI, 0-6 items). Empty array if no dupe.",
                    },
                    contextMatch: {
                      type: "string",
                      description:
                        "ONE sentence on WHY these match beyond ingredients (skin concern, texture, finish). Empty string if no dupe.",
                    },
                    dupeType: {
                      type: "string",
                      enum: ["Lookalike packaging", "Formula dupe", "Both", "Neither"],
                      description: "Why this qualifies as a dupe. 'Neither' if no dupe found.",
                    },
                    packagingSimilarity: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                      description:
                        "How visually similar the dupe's packaging is to the original (0-100). 0 if no dupe.",
                    },
                    riskLevel: {
                      type: "string",
                      enum: ["Lower risk", "Comparable", "Higher risk"],
                      description:
                        "Switching risk. Use 'Comparable' as the safe default if no dupe.",
                    },
                    riskFactors: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "0-4 short specific concerns about the dupe ('Added fragrance', 'Denatured alcohol high in INCI'). Empty if none.",
                    },
                    missingActives: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "0-4 actives the original has that the dupe drops. Empty if nothing meaningful is lost.",
                    },
                    safetyNote: {
                      type: "string",
                      description:
                        "ONE plain-English esthetician sentence about who/where this dupe is OK to use. Empty string if no dupe.",
                    },
                  },
                  required: [
                    "original",
                    "dupe",
                    "matchScore",
                    "verdict",
                    "notes",
                    "bestFor",
                    "confidence",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "analyze_dupe" } },
          temperature: 0.2,
          max_tokens: 2400,
        }),
      });

      if (res.status === 429) {
        return {
          result: null,
          error: "We're getting a lot of scans right now — try again in a minute.",
        };
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
      const parsed = normalizeAnalysis(JSON.parse(argsRaw) as Partial<DupeAnalysis>);

      // Quietly cross-reference our internal dupe DB. If we have verified data
      // for this product, swap in the highest-rated verified dupe and use the
      // verified match score. If we don't, enqueue the product for ingestion
      // so future scans of the same product are backed by real data.
      try {
        await crossReferenceDupeDb(parsed);
      } catch (err) {
        console.warn("[dupedb] cross-reference failed, ignoring:", err);
      }

      // Best-effort: enrich both the original and the dupe with real product photos in parallel.
      // Wrap each lookup so a thrown error (network / ranker / malformed data) never wipes a valid analysis.
      const safeFind = async (b?: string | null, n?: string | null) => {
        try {
          return await findProductImage(b, n);
        } catch (err) {
          console.warn("[findProductImage] threw, ignoring:", err);
          return undefined;
        }
      };
      const [originalImg, dupeImg] = await Promise.all([
        parsed.original
          ? safeFind(parsed.original.brand, parsed.original.productName)
          : Promise.resolve(undefined),
        parsed.dupe
          ? safeFind(parsed.dupe.brand, parsed.dupe.productName)
          : Promise.resolve(undefined),
      ]);
      if (originalImg && parsed.original) parsed.original.imageUrl = originalImg;
      if (dupeImg && parsed.dupe) parsed.dupe.imageUrl = dupeImg;

      return { result: parsed, error: null };
    } catch (e) {
      console.error("scanProduct failed", e);
      return { result: null, error: "Something went wrong. Please try again." };
    }
  });

function normalizeAnalysis(input: Partial<DupeAnalysis>): DupeAnalysis {
  const original = (input.original ?? {}) as Partial<ScannedProduct>;
  const dupe = input.dupe ?? null;
  const verdicts = ["Worth the hype", "Mixed", "Skip", "Risky dupe", "No dupe found"] as const;
  const riskLevels = ["Lower risk", "Comparable", "Higher risk"] as const;
  const dupeTypes = ["Lookalike packaging", "Formula dupe", "Both", "Neither"] as const;

  return {
    original: {
      productName: safeText(original.productName, "Unknown product"),
      brand: safeText(original.brand, "Unknown brand"),
      category: safeText(original.category, "Beauty product"),
      estimatedPriceUsd: safeNumber(original.estimatedPriceUsd),
      keyIngredients: safeList(original.keyIngredients),
      imageUrl: original.imageUrl,
    },
    dupe: dupe
      ? {
          productName: safeText(dupe.productName, "Suggested alternative"),
          brand: safeText(dupe.brand, "Unknown brand"),
          category: safeText(dupe.category, "Beauty product"),
          estimatedPriceUsd: safeNumber(dupe.estimatedPriceUsd),
          whereToBuy: safeText(dupe.whereToBuy, "Online"),
          buyUrl: safeUrl(dupe.buyUrl, dupe.brand, dupe.productName),
          keyIngredients: safeList(dupe.keyIngredients),
          imageUrl: dupe.imageUrl,
        }
      : null,
    matchScore: clampScore(input.matchScore),
    verdict: verdicts.includes(input.verdict as DupeAnalysis["verdict"])
      ? (input.verdict as DupeAnalysis["verdict"])
      : dupe
        ? "Mixed"
        : "No dupe found",
    notes: safeText(
      input.notes,
      "We found the closest practical comparison, but double-check the label if your skin is sensitive.",
    ),
    bestFor: safeList(input.bestFor),
    confidence: ["high", "medium", "low"].includes(input.confidence ?? "")
      ? (input.confidence as DupeAnalysis["confidence"])
      : "medium",
    sharedIngredients: safeList(input.sharedIngredients),
    uniqueToOriginal: safeList(input.uniqueToOriginal),
    uniqueToDupe: safeList(input.uniqueToDupe),
    contextMatch: safeText(input.contextMatch, ""),
    dupeType: dupeTypes.includes(input.dupeType as NonNullable<DupeAnalysis["dupeType"]>)
      ? input.dupeType
      : dupe
        ? "Formula dupe"
        : "Neither",
    packagingSimilarity: clampScore(input.packagingSimilarity),
    riskLevel: riskLevels.includes(input.riskLevel as NonNullable<DupeAnalysis["riskLevel"]>)
      ? input.riskLevel
      : "Comparable",
    riskFactors: safeList(input.riskFactors),
    missingActives: safeList(input.missingActives),
    safetyNote: safeText(input.safetyNote, ""),
  };
}

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
        .slice(0, 6)
    : [];
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0;
}

function safeUrl(value: unknown, brand?: string, productName?: string) {
  if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${brand ?? ""} ${productName ?? ""}`.trim() || "beauty product dupe")}`;
}

/**
 * Best-effort product image lookup. Tries DuckDuckGo's image JSON endpoint
 * first (it returns rich `width`/`height`/`source` metadata that the ranker
 * uses heavily), and falls back to Bing's async image endpoint when DDG is
 * unreachable from the runtime (e.g. the production Worker intermittently
 * gets Cloudflare 525s when calling DDG).
 * Returns undefined on any failure so a missing image never breaks the scan.
 */
async function findProductImage(
  brand?: string | null,
  productName?: string | null,
): Promise<string | undefined> {
  const safeBrand = (brand ?? "").trim();
  const safeName = (productName ?? "").trim();
  const query = `${safeBrand} ${safeName}`.trim();
  if (!query) return undefined;
  console.log("[findProductImage] looking up:", query);

  const ddg = await searchDuckDuckGoImages(query);
  if (ddg && ddg.length > 0) {
    const best = pickBestProductImage(ddg, safeBrand, safeName);
    console.log(
      "[findProductImage] ddg found:",
      best.image,
      "score:",
      best.score,
      "from:",
      best.url ?? best.source,
    );
    return best.image;
  }

  const bing = await searchBingImages(query);
  if (bing && bing.length > 0) {
    const best = pickBestProductImage(bing, safeBrand, safeName);
    console.log(
      "[findProductImage] bing found:",
      best.image,
      "score:",
      best.score,
      "from:",
      best.url ?? best.source,
    );
    return best.image;
  }

  console.warn("[findProductImage] no image results from any provider");
  return undefined;
}

type ImageCandidate = {
  image?: string;
  url?: string;
  source?: string;
  title?: string;
  width?: number;
  height?: number;
};

/** DuckDuckGo image search — preferred (rich metadata for ranking). */
async function searchDuckDuckGoImages(query: string): Promise<ImageCandidate[] | null> {
  try {
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
      console.warn("[findProductImage] ddg token fetch failed", tokenRes.status);
      return null;
    }
    const tokenHtml = await tokenRes.text();
    const vqdMatch =
      tokenHtml.match(/vqd=([\d-]+)&/) ||
      tokenHtml.match(/vqd="([\d-]+)"/) ||
      tokenHtml.match(/vqd=([\d-]+)/);
    const vqd = vqdMatch?.[1];
    if (!vqd) {
      console.warn("[findProductImage] no vqd token in response");
      return null;
    }

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
      console.warn("[findProductImage] ddg api fetch failed", apiRes.status);
      return null;
    }
    const data = (await apiRes.json()) as { results?: ImageCandidate[] };
    const candidates = (data.results ?? []).filter((r) => r.image && /^https?:\/\//i.test(r.image));
    return candidates;
  } catch (e) {
    console.warn("[findProductImage] ddg failed", e);
    return null;
  }
}

/** Bing image search — fallback when DDG is unreachable. */
async function searchBingImages(query: string): Promise<ImageCandidate[] | null> {
  try {
    const url =
      `https://www.bing.com/images/async?q=${encodeURIComponent(query)}` +
      `&first=1&count=30&mmasync=1&adlt=moderate`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.warn("[findProductImage] bing fetch failed", res.status);
      return null;
    }
    const html = await res.text();

    // Each tile is an <a class="iusc" ... m="{...json...}"> with HTML-escaped JSON.
    const tileRegex = /m="([^"]+)"/g;
    const candidates: ImageCandidate[] = [];
    let match: RegExpExecArray | null;
    while ((match = tileRegex.exec(html)) !== null) {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      try {
        const m = JSON.parse(decoded) as {
          murl?: string;
          purl?: string;
          t?: string;
          desc?: string;
        };
        if (m.murl && /^https?:\/\//i.test(m.murl)) {
          candidates.push({
            image: m.murl,
            url: m.purl,
            source: m.purl,
            title: m.t ?? m.desc,
          });
        }
      } catch {
        // skip malformed tile
      }
      if (candidates.length >= 30) break;
    }

    return candidates;
  } catch (e) {
    console.warn("[findProductImage] bing failed", e);
    return null;
  }
}

/**
 * Rank image results to prefer real retailer / brand storefront product pages
 * over generic blog thumbnails, Pinterest pins, marketplace listings, etc.
 */
function pickBestProductImage(
  results: Array<{
    image?: string;
    url?: string;
    source?: string;
    title?: string;
    width?: number;
    height?: number;
  }>,
  brand: string,
  productName: string,
): { image: string; score: number; url?: string; source?: string } {
  // Trusted beauty/skincare retailers + general retailers that typically host
  // clean, on-white product photography on real product pages.
  const RETAILER_DOMAINS = [
    "sephora.com",
    "ulta.com",
    "target.com",
    "walmart.com",
    "amazon.com",
    "cvs.com",
    "walgreens.com",
    "riteaid.com",
    "dollartree.com",
    "dollargeneral.com",
    "boots.com",
    "lookfantastic.com",
    "cultbeauty.com",
    "spacenk.com",
    "beautylish.com",
    "dermstore.com",
    "skinstore.com",
    "bluemercury.com",
    "credobeauty.com",
    "nordstrom.com",
    "macys.com",
    "bloomingdales.com",
    "saksfifthavenue.com",
    "costco.com",
    "samsclub.com",
    "kohls.com",
    "thebay.com",
  ];
  // Sources that usually serve cropped/low-quality thumbnails or unrelated lifestyle shots.
  const PENALIZED_DOMAINS = [
    "pinterest.",
    "lookaside.fbsbx.com",
    "fbcdn.net",
    "instagram.com",
    "cdninstagram.com",
    "tiktok.com",
    "tiktokcdn.com",
    "youtube.com",
    "ytimg.com",
    "reddit.com",
    "redd.it",
    "ebay.com",
    "ebayimg.com",
    "etsy.com",
    "poshmark.com",
    "mercari.com",
    "depop.com",
    "aliexpress.com",
    "alicdn.com",
    "wish.com",
    "dhgate.com",
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
    if (
      RETAILER_DOMAINS.some((d) => imgHost.endsWith(d) || imgHost.includes(d.replace(".com", "")))
    )
      score += 20;
    // Brand's own storefront (e.g. cerave.com, theordinary.com).
    if (brandSlug.length >= 4 && pageHost.includes(brandSlug)) score += 40;
    if (brandSlug.length >= 4 && imgHost.includes(brandSlug)) score += 15;
    // URL path hints we're on a real product page, not a blog/listicle.
    if (/\/(p|product|products|prod|item|dp|ip)[/-]/i.test(r.url ?? "")) score += 25;
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

// --- Internal dupe DB cross-reference ----------------------------------------
// Quietly enriches an analysis with verified data from our products+dupes
// tables. Source (SkinSort) is never surfaced to the user.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "./skinsort-slugs";

async function crossReferenceDupeDb(analysis: DupeAnalysis): Promise<void> {
  if (!analysis.original?.brand || !analysis.original?.productName) return;

  const brandSlug = slugify(analysis.original.brand);
  const productSlug = slugify(analysis.original.productName);

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("id, brand_name, product_name, category, image_url, free_from, good_for, contains")
    .eq("brand_slug", brandSlug)
    .eq("product_slug", productSlug)
    .maybeSingle();

  if (!product) {
    // Miss — enqueue for background ingestion. Conflict on pending unique idx is silent.
    await supabaseAdmin
      .from("ingestion_queue")
      .insert({
        brand_slug: brandSlug,
        product_slug: productSlug,
        reason: "user_scan_miss",
        priority: 10,
      });
    return;
  }

  // Hit — pull the top verified dupe.
  const { data: dupeRows } = await supabaseAdmin
    .from("dupes")
    .select(
      `overall_match, ingredient_match, shared_ingredients_count, rationale,
       dupe:products!dupes_dupe_product_id_fkey ( brand_name, product_name, category, image_url )`,
    )
    .eq("original_product_id", product.id)
    .order("overall_match", { ascending: false })
    .limit(1);

  const top = (dupeRows ?? [])[0];
  const topDupe = top?.dupe as
    | { brand_name: string; product_name: string; category: string | null; image_url: string | null }
    | null
    | undefined;

  // If our verified top dupe is materially better than the AI's guess, swap it in.
  if (top && topDupe && top.overall_match >= analysis.matchScore) {
    analysis.dupe = {
      productName: topDupe.product_name,
      brand: topDupe.brand_name,
      category: topDupe.category ?? analysis.dupe?.category ?? "Beauty product",
      estimatedPriceUsd: analysis.dupe?.estimatedPriceUsd ?? 0,
      whereToBuy: analysis.dupe?.whereToBuy ?? "Online",
      buyUrl:
        analysis.dupe?.buyUrl ??
        `https://www.amazon.com/s?k=${encodeURIComponent(`${topDupe.brand_name} ${topDupe.product_name}`)}`,
      keyIngredients: analysis.dupe?.keyIngredients ?? [],
      imageUrl: topDupe.image_url ?? analysis.dupe?.imageUrl,
    };
    analysis.matchScore = top.overall_match;
    analysis.confidence = "high";
    if (top.rationale && (!analysis.notes || analysis.notes.length < 40)) {
      analysis.notes = top.rationale;
    }
  }
}
