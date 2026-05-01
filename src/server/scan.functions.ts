// Lovable AI vision: identify a beauty product from a photo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20),
});

export type ScanResult = {
  productName: string;
  brand: string | null;
  category: string | null;
  description: string;
  confidence: "high" | "medium" | "low";
};

export const scanProduct = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<{ result: ScanResult | null; error: string | null }> => {
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
              content:
                "You are a beauty product identifier. Look at the image and identify the product. Always call the identify_product tool exactly once. If you are not certain, return your best guess and lower the confidence.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Identify this beauty/skincare product." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "identify_product",
                description: "Return identification of the beauty product in the image.",
                parameters: {
                  type: "object",
                  properties: {
                    productName: { type: "string", description: "Full product name as printed" },
                    brand: { type: "string", description: "Brand name, or empty if unknown" },
                    category: {
                      type: "string",
                      description: "e.g. Serum, Face Mist, Eye Cream, Moisturizer, Mask, Cleanser",
                    },
                    description: { type: "string", description: "One-sentence summary of what the product is" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["productName", "brand", "category", "description", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "identify_product" } },
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
      const parsed = JSON.parse(argsRaw) as ScanResult;
      return { result: parsed, error: null };
    } catch (e) {
      console.error("scanProduct failed", e);
      return { result: null, error: "Something went wrong. Please try again." };
    }
  });
