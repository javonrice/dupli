// Lovable AI vision: identify a beauty product AND suggest a dupe in one call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveProductLinks, type ProductLink } from "@/server/product-links.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "@/server/skinsort-slugs";

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
  /** Verified retailer links resolved server-side after the AI call. */
  links?: ProductLink[];
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
  /** Verified retailer links resolved server-side after the AI call. */
  links?: ProductLink[];
  // Per-candidate comparison fields (mirrors top-level for the #1 pick).
  matchScore?: number;
  dupeType?: "Lookalike packaging" | "Formula dupe" | "Both" | "Neither";
  packagingSimilarity?: number;
  riskLevel?: "Lower risk" | "Comparable" | "Higher risk";
  riskFactors?: string[];
  missingActives?: string[];
  safetyNote?: string;
  sharedIngredients?: string[];
  uniqueToOriginal?: string[];
  uniqueToDupe?: string[];
  contextMatch?: string;
  notes?: string;
};

export type DupeAnalysis = {
  original: ScannedProduct;
  dupe: DupeSuggestion | null;
  /** All AI-ranked candidates, sorted best -> worst. dupe === dupes[0] when present. */
  dupes?: DupeSuggestion[];
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
  /** "classic-dupe" = scanned the name brand, dupe is cheaper.
   *  "steal-find"   = scanned a cheaper product that dupes a pricier name brand. */
  framing: "classic-dupe" | "steal-find";
  /** Always positive 0-100. Classic = saved switching to dupe.
   *  Steal = how much cheaper the scanned item is vs the name brand it dupes. */
  savingsPct: number;
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
                "Step 1: Identify the product in the image (name, brand, category, typical retail price, key actives).",
                "Step 2: Generate a SHORTLIST of 5-7 candidate dupes (cheaper alternatives or, if the scan is itself a cheap lookalike, the name-brand counterpart it mimics + other comparable picks). Each candidate must be a real, buyable product. Diversity matters — don't list near-duplicate retailer listings of the same SKU.",
                "Step 3: For EACH candidate, provide brand, productName, category, estimatedPriceUsd, whereToBuy, a working buyUrl (retailer product page or retailer search URL), keyIngredients, dupeType, packagingSimilarity, matchScore, riskLevel, riskFactors, missingActives, sharedIngredients, uniqueToOriginal, uniqueToDupe, a one-sentence contextMatch, a one-sentence safetyNote, and a one-sentence notes.",
                "Step 4: Score packagingSimilarity 0-100 honestly per candidate (color, shape, typography, label layout). Score matchScore 0-100 per candidate (formula + intended effect closeness).",
                "Step 5: SORT the array best -> worst by overall fit (matchScore, then risk, then packaging similarity). The FIRST item must be your strongest pick — the rest of the app shows it as the headline dupe. Be honest: don't pad the list with weak picks if you only have 3 credible options (return what you have, minimum 1).",
                "Step 6: Compare formulas. Use canonical INCI names. sharedIngredients/uniqueToOriginal/uniqueToDupe arrays: 0-6 items each, no repeats across lists, prioritize meaningful actives over water/fillers.",
                "Step 7: Assess RISK per candidate.",
                "  - 'Lower risk' = dupe is gentler / fewer irritants than original",
                "  - 'Comparable' = roughly equivalent safety profile",
                "  - 'Higher risk' = dupe introduces irritants the original avoided (added fragrance, denatured alcohol high in INCI, unbuffered acids, mislabeled SPF, harsh sulfates in a sensitive-skin category, etc.)",
                "Step 8: riskFactors = 0-4 short specific concerns. missingActives = 0-4 actives the original has that the dupe drops.",
                "Step 9: safetyNote = ONE plain-English sentence an esthetician would say out loud about who/where this dupe is OK to use.",
                "Step 10: contextMatch = ONE sentence on WHY this candidate matches beyond ingredients (skin concern, texture, finish).",
                "Step 11: TOP-LEVEL fields (matchScore, verdict, notes, bestFor, sharedIngredients, uniqueToOriginal, uniqueToDupe, contextMatch, dupeType, packagingSimilarity, riskLevel, riskFactors, missingActives, safetyNote) MUST mirror the FIRST candidate exactly so existing screens render correctly.",
                "Step 12: Verdict — be honest, never inflate:",
                "  - 'Worth the hype' = credible swap, comparable or lower risk",
                "  - 'Mixed' = some tradeoffs but defensible for the right user",
                "  - 'Risky dupe' = clearly cheaper / lookalike but the formula tradeoff is bad enough we should warn the user",
                "  - 'Skip' = not a real dupe, or actively worse in ways that matter",
                "  - 'No dupe found' = no credible counterpart exists (return empty dupes array in this case)",
                "STEAL-FIND CASE: If the scanned product is meaningfully cheaper than every credible counterpart (drugstore, dollar store, off-brand), the user has FOUND A STEAL. Verdict still reflects formula honesty (Worth the hype if it genuinely matches; Mixed if it cuts corners; Risky dupe if it adds irritants), but the `notes` copy should celebrate the find ('You scored — this $X buy holds its own against the $Y name brand') rather than warn about a swap.",
                "If you genuinely cannot find ANY credible dupe, set dupes to [], verdict 'No dupe found', and leave comparison/risk lists empty.",
                "Always call analyze_dupe exactly once.",
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
                    dupes: {
                      type: "array",
                      minItems: 0,
                      maxItems: 7,
                      description:
                        "Ranked list of 5-7 candidate dupes, sorted best -> worst. The first item is the headline dupe. Empty array if no credible dupe exists.",
                      items: {
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
                          matchScore: { type: "number", minimum: 0, maximum: 100 },
                          dupeType: {
                            type: "string",
                            enum: ["Lookalike packaging", "Formula dupe", "Both", "Neither"],
                          },
                          packagingSimilarity: { type: "number", minimum: 0, maximum: 100 },
                          riskLevel: {
                            type: "string",
                            enum: ["Lower risk", "Comparable", "Higher risk"],
                          },
                          riskFactors: { type: "array", items: { type: "string" } },
                          missingActives: { type: "array", items: { type: "string" } },
                          safetyNote: { type: "string" },
                          sharedIngredients: { type: "array", items: { type: "string" } },
                          uniqueToOriginal: { type: "array", items: { type: "string" } },
                          uniqueToDupe: { type: "array", items: { type: "string" } },
                          contextMatch: { type: "string" },
                          notes: { type: "string" },
                        },
                        required: [
                          "productName",
                          "brand",
                          "category",
                          "estimatedPriceUsd",
                          "whereToBuy",
                          "buyUrl",
                          "keyIngredients",
                          "matchScore",
                        ],
                        additionalProperties: false,
                      },
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
                    "dupes",
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
          max_tokens: 5500,
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

      // Merge in SkinSort-mirrored community dupes for the scanned original.
      // Failure is silent — never blocks the scan.
      try {
        const extras = await fetchSkinsortDupes(
          parsed.original?.brand,
          parsed.original?.productName,
          4,
        );
        if (extras.length > 0 && parsed.dupes) {
          const seen = new Set(
            parsed.dupes.map((d) => `${slugify(d.brand)}/${slugify(d.productName)}`),
          );
          for (const e of extras) {
            const key = `${slugify(e.brand)}/${slugify(e.productName)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            parsed.dupes.push(e);
            if (parsed.dupes.length >= 8) break;
          }
        }
      } catch (err) {
        console.warn("[skinsort merge] failed, ignoring:", err);
      }

      // Best-effort: enrich the original AND every dupe candidate with real product photos in parallel.
      // Capped at 7 candidates by the schema. Each lookup is wrapped so a failure never wipes the analysis.
      const safeFind = async (b?: string | null, n?: string | null) => {
        try {
          return await findProductImage(b, n);
        } catch (err) {
          console.warn("[findProductImage] threw, ignoring:", err);
          return undefined;
        }
      };
      const candidates = parsed.dupes ?? [];
      const lookups = await Promise.all([
        parsed.original
          ? safeFind(parsed.original.brand, parsed.original.productName)
          : Promise.resolve(undefined),
        ...candidates.map((c) => safeFind(c.brand, c.productName)),
      ]);
      const [originalImg, ...dupeImgs] = lookups;
      if (originalImg && parsed.original) parsed.original.imageUrl = originalImg;
      candidates.forEach((c, i) => {
        if (dupeImgs[i]) c.imageUrl = dupeImgs[i];
      });
      // Re-sync the headline `dupe` (which is candidates[0]) so its imageUrl matches.
      if (parsed.dupe && candidates[0]) parsed.dupe = candidates[0];

      // Resolve REAL buyable retailer links for the original + every dupe candidate.
      // Each call is best-effort and time-budgeted; failures never block the scan.
      const safeLinks = async (b?: string | null, n?: string | null) => {
        try {
          return await resolveProductLinks(b, n);
        } catch (err) {
          console.warn("[resolveProductLinks] threw, ignoring:", err);
          return [];
        }
      };
      const linkLookups = await Promise.all([
        parsed.original
          ? safeLinks(parsed.original.brand, parsed.original.productName)
          : Promise.resolve([] as ProductLink[]),
        ...candidates.map((c) => safeLinks(c.brand, c.productName)),
      ]);
      const [originalLinks, ...dupeLinks] = linkLookups;
      if (parsed.original && originalLinks.length > 0) parsed.original.links = originalLinks;
      candidates.forEach((c, i) => {
        if (dupeLinks[i] && dupeLinks[i].length > 0) c.links = dupeLinks[i];
      });
      // Re-sync headline dupe again so its links field matches.
      if (parsed.dupe && candidates[0]) parsed.dupe = candidates[0];

      return { result: parsed, error: null };
    } catch (e) {
      console.error("scanProduct failed", e);
      return { result: null, error: "Something went wrong. Please try again." };
    }
  });

function normalizeAnalysis(input: Partial<DupeAnalysis>): DupeAnalysis {
  const original = (input.original ?? {}) as Partial<ScannedProduct>;
  const verdicts = ["Worth the hype", "Mixed", "Skip", "Risky dupe", "No dupe found"] as const;
  const riskLevels = ["Lower risk", "Comparable", "Higher risk"] as const;
  const dupeTypes = ["Lookalike packaging", "Formula dupe", "Both", "Neither"] as const;

  // Build the candidates array. Prefer new `dupes` field; fall back to legacy single `dupe`.
  const rawDupes: Partial<DupeSuggestion>[] = Array.isArray(input.dupes)
    ? input.dupes
    : input.dupe
      ? [input.dupe]
      : [];

  const dupes: DupeSuggestion[] = rawDupes
    .slice(0, 7)
    // Re-sort by matchScore desc so the highest-percentage dupe is always the headline,
    // regardless of how the model ordered its array.
    .sort((a, b) => (Number(b?.matchScore) || 0) - (Number(a?.matchScore) || 0))
    .map((d) => ({
    productName: safeText(d?.productName, "Suggested alternative"),
    brand: safeText(d?.brand, "Unknown brand"),
    category: safeText(d?.category, "Beauty product"),
    estimatedPriceUsd: safeNumber(d?.estimatedPriceUsd),
    whereToBuy: safeText(d?.whereToBuy, "Online"),
    buyUrl: safeUrl(d?.buyUrl, d?.brand, d?.productName),
    keyIngredients: safeList(d?.keyIngredients),
    imageUrl: d?.imageUrl,
    matchScore: clampScore(d?.matchScore),
    dupeType: dupeTypes.includes(d?.dupeType as NonNullable<DupeAnalysis["dupeType"]>)
      ? d?.dupeType
      : "Formula dupe",
    packagingSimilarity: clampScore(d?.packagingSimilarity),
    riskLevel: riskLevels.includes(d?.riskLevel as NonNullable<DupeAnalysis["riskLevel"]>)
      ? d?.riskLevel
      : "Comparable",
    riskFactors: safeList(d?.riskFactors),
    missingActives: safeList(d?.missingActives),
    safetyNote: safeText(d?.safetyNote, ""),
    sharedIngredients: safeList(d?.sharedIngredients),
    uniqueToOriginal: safeList(d?.uniqueToOriginal),
    uniqueToDupe: safeList(d?.uniqueToDupe),
    contextMatch: safeText(d?.contextMatch, ""),
    notes: safeText(d?.notes, ""),
  }));

  const headline = dupes[0] ?? null;

  // Steal-find detection: deterministic, never trust the model. We only flip
  // framing when both prices are present, the dupe is meaningfully more
  // expensive than the scanned item (>25% buffer to ignore noise), and we
  // actually have a headline candidate.
  const originalPrice = safeNumber(original.estimatedPriceUsd);
  const dupePrice = headline ? headline.estimatedPriceUsd : 0;
  const isStealFind =
    !!headline &&
    originalPrice > 0 &&
    dupePrice > 0 &&
    dupePrice > originalPrice * 1.25;

  let savingsPct = 0;
  if (headline && originalPrice > 0 && dupePrice > 0) {
    savingsPct = isStealFind
      ? Math.round(((dupePrice - originalPrice) / dupePrice) * 100)
      : Math.max(0, Math.round(((originalPrice - dupePrice) / originalPrice) * 100));
  }

  return {
    original: {
      productName: safeText(original.productName, "Unknown product"),
      brand: safeText(original.brand, "Unknown brand"),
      category: safeText(original.category, "Beauty product"),
      estimatedPriceUsd: originalPrice,
      keyIngredients: safeList(original.keyIngredients),
      imageUrl: original.imageUrl,
    },
    dupe: headline,
    dupes,
    // Top-level fields mirror the headline candidate when AI didn't fill them in.
    matchScore: typeof input.matchScore === "number"
      ? clampScore(input.matchScore)
      : (headline?.matchScore ?? 0),
    verdict: verdicts.includes(input.verdict as DupeAnalysis["verdict"])
      ? (input.verdict as DupeAnalysis["verdict"])
      : headline
        ? "Mixed"
        : "No dupe found",
    notes: safeText(
      input.notes ?? headline?.notes,
      "We found the closest practical comparison, but double-check the label if your skin is sensitive.",
    ),
    bestFor: safeList(input.bestFor),
    confidence: ["high", "medium", "low"].includes(input.confidence ?? "")
      ? (input.confidence as DupeAnalysis["confidence"])
      : "medium",
    sharedIngredients: safeList(input.sharedIngredients ?? headline?.sharedIngredients),
    uniqueToOriginal: safeList(input.uniqueToOriginal ?? headline?.uniqueToOriginal),
    uniqueToDupe: safeList(input.uniqueToDupe ?? headline?.uniqueToDupe),
    contextMatch: safeText(input.contextMatch ?? headline?.contextMatch, ""),
    dupeType: dupeTypes.includes(input.dupeType as NonNullable<DupeAnalysis["dupeType"]>)
      ? input.dupeType
      : headline?.dupeType ?? (headline ? "Formula dupe" : "Neither"),
    packagingSimilarity: typeof input.packagingSimilarity === "number"
      ? clampScore(input.packagingSimilarity)
      : (headline?.packagingSimilarity ?? 0),
    riskLevel: riskLevels.includes(input.riskLevel as NonNullable<DupeAnalysis["riskLevel"]>)
      ? input.riskLevel
      : headline?.riskLevel ?? "Comparable",
    riskFactors: safeList(input.riskFactors ?? headline?.riskFactors),
    missingActives: safeList(input.missingActives ?? headline?.missingActives),
    safetyNote: safeText(input.safetyNote ?? headline?.safetyNote, ""),
    framing: isStealFind ? "steal-find" : "classic-dupe",
    savingsPct,
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
// Intentionally removed for now. The SkinSort-backed products/dupes tables are
// populated in the background but not consulted during scans. To re-enable,
// reintroduce a `crossReferenceDupeDb` helper in a `.server.ts` module and
// import it here, then call it from the scan handler.

