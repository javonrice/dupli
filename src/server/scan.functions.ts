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
};

export type DupeSuggestion = {
  productName: string;
  brand: string;
  category: string;
  estimatedPriceUsd: number;
  whereToBuy: string;
  keyIngredients: string[];
};

export type DupeAnalysis = {
  original: ScannedProduct;
  dupe: DupeSuggestion | null;
  matchScore: number; // 0-100
  verdict: "Worth the hype" | "Mixed" | "Skip" | "No dupe found";
  notes: string;
  bestFor: string[];
  confidence: "high" | "medium" | "low";
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
                "Step 3: Compare formulas and give a match score (0-100) based on how close the active ingredients and intended effect are.",
                "Step 4: Give an honest esthetician verdict and short notes.",
                "If you genuinely cannot find a credible dupe, set dupe to null and verdict to 'No dupe found'.",
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
                            whereToBuy: { type: "string", description: "e.g. Dollar Tree, Target, Amazon, CVS" },
                            keyIngredients: { type: "array", items: { type: "string" } },
                          },
                          required: ["productName", "brand", "category", "estimatedPriceUsd", "whereToBuy", "keyIngredients"],
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
                  },
                  required: ["original", "dupe", "matchScore", "verdict", "notes", "bestFor", "confidence"],
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
      return { result: parsed, error: null };
    } catch (e) {
      console.error("scanProduct failed", e);
      return { result: null, error: "Something went wrong. Please try again." };
    }
  });
