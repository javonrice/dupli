import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureCachedProductImage } from "@/lib/product-images.server";

export type DupePair = {
  pairId: string;
  matchPct: number;
  original: {
    id: string;
    brand: string;
    name: string;
    imageUrl: string;
    priceUsd: number;
  };
  dupe: {
    id: string;
    brand: string;
    name: string;
    imageUrl: string;
    priceUsd: number;
  };
  savingsUsd: number;
};

// Pick a random high-match dupe pair where both products have images + prices
// and the pair hasn't been generated in the last 30 days.
export const pickRandomDupePair = createServerFn({ method: "POST" }).handler(
  async (): Promise<DupePair> => {
    // Pull a candidate window and pick randomly.

    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("dupes")
      .select(
        `id, overall_match,
         original:products!dupes_original_product_id_fkey ( id, brand_name, product_name, image_url, lowest_price_usd ),
         dupe:products!dupes_dupe_product_id_fkey ( id, brand_name, product_name, image_url, lowest_price_usd )`,
      )
      .gte("overall_match", 70)
      .order("overall_match", { ascending: false })
      .limit(500);

    if (qErr) throw new Error(`Failed to load dupe candidates: ${qErr.message}`);
    if (!candidates || candidates.length === 0) {
      throw new Error("No dupe candidates found");
    }

    // Filter for usable rows: both sides need image + price, and dupe must be cheaper.
    type Row = (typeof candidates)[number];
    const usable = (candidates as Row[]).filter((row) => {
      const o = row.original as unknown as {
        id: string;
        brand_name: string;
        product_name: string;
        image_url: string | null;
        lowest_price_usd: number | null;
      } | null;
      const d = row.dupe as unknown as {
        id: string;
        brand_name: string;
        product_name: string;
        image_url: string | null;
        lowest_price_usd: number | null;
      } | null;
      if (!o || !d) return false;
      if (!o.image_url || !d.image_url) return false;
      if (o.lowest_price_usd == null || d.lowest_price_usd == null) return false;
      return Number(d.lowest_price_usd) < Number(o.lowest_price_usd);
    });

    if (usable.length === 0) {
      throw new Error("No usable dupe pairs (need both images + prices, dupe cheaper)");
    }

    // Exclude pairs generated in the last 30 days.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("dashboard_generations")
      .select("original_product_id, dupe_product_id")
      .gte("created_at", since);
    const recentSet = new Set(
      (recent ?? []).map((r) => `${r.original_product_id}::${r.dupe_product_id}`),
    );

    const fresh = usable.filter((row) => {
      const o = row.original as unknown as { id: string };
      const d = row.dupe as unknown as { id: string };
      return !recentSet.has(`${o.id}::${d.id}`);
    });

    const pool = fresh.length > 0 ? fresh : usable;
    const picked = pool[Math.floor(Math.random() * pool.length)];

    const o = picked.original as unknown as {
      id: string;
      brand_name: string;
      product_name: string;
      image_url: string;
      lowest_price_usd: number;
    };
    const d = picked.dupe as unknown as {
      id: string;
      brand_name: string;
      product_name: string;
      image_url: string;
      lowest_price_usd: number;
    };
    // Record this generation so we don't repeat soon.
    await supabaseAdmin
      .from("dashboard_generations")
      .insert({ original_product_id: o.id, dupe_product_id: d.id });

    // Cache product images in our own storage so downstream services
    // (fal.ai, Nano Banana, OG renderers, etc.) don't have to reach the
    // original source CDN — which sometimes 403s third-party clients.
    const [originalImageUrl, dupeImageUrl] = await Promise.all([
      ensureCachedProductImage(o.id),
      ensureCachedProductImage(d.id),
    ]);

    return {
      pairId: picked.id,
      matchPct: picked.overall_match,
      original: {
        id: o.id,
        brand: o.brand_name,
        name: o.product_name,
        imageUrl: originalImageUrl,
        priceUsd: Number(o.lowest_price_usd),
      },
      dupe: {
        id: d.id,
        brand: d.brand_name,
        name: d.product_name,
        imageUrl: dupeImageUrl,
        priceUsd: Number(d.lowest_price_usd),
      },
      savingsUsd: Number(o.lowest_price_usd) - Number(d.lowest_price_usd),
    };
  },
);
  },
);

// ---------- Image generation via Nano Banana ----------

type SlideInput = {
  slide: 1 | 2 | 3 | 4;
  pair: DupePair;
  wordmarkUrl: string;
};

const MODEL = "google/gemini-2.5-flash-image";

function buildPrompt({ slide, pair }: SlideInput): string {
  const orig = pair.original;
  const dupe = pair.dupe;
  const matchPct = pair.matchPct;
  const savings = pair.savingsUsd.toFixed(0);

  switch (slide) {
    case 1:
      return `Create a viral Instagram carousel slide, 1:1 square, 1024x1024.
Hero shot of the product "${orig.brand} ${orig.name}" (use the provided product reference image) on a clean, premium pastel pink studio backdrop with soft shadows. The product should be large and centered, taking up about 60% of the frame.
Bold sans-serif overlay text at the top: "Still paying $${orig.priceUsd.toFixed(0)} for this?"
Place the provided "dupli" wordmark image small in the bottom-right corner with about 5% padding — preserve its shape and the red dot.
Style: glossy, premium, beauty editorial, attention-grabbing, very high contrast. No watermarks except the dupli wordmark.`;

    case 2:
      return `Create a viral Instagram carousel slide, 1:1 square, 1024x1024.
Photorealistic scene: a hand holding a modern smartphone in a brightly lit drugstore beauty aisle. The phone camera is actively scanning a real product on the shelf — the product is "${orig.brand} ${orig.name}" (use the provided product reference image). The phone screen shows a live camera viewfinder with a glowing scanning bracket overlay around the product, suggesting AI detection.
Bold overlay text at the top: "Scan it. Find the dupe."
Place the provided "dupli" wordmark image small in the bottom-right corner — preserve its shape and the red dot.
Style: photorealistic, real retail environment, candid feel, no fake mockup look.`;

    case 3:
      return `Create a viral Instagram carousel slide, 1:1 square, 1024x1024.
Side-by-side product comparison on a clean off-white background.
LEFT: "${orig.brand} ${orig.name}" (first provided product image) labeled "ORIGINAL" with a price tag showing "$${orig.priceUsd.toFixed(0)}".
RIGHT: "${dupe.brand} ${dupe.name}" (second provided product image) labeled "DUPE" with a price tag showing "$${dupe.priceUsd.toFixed(0)}".
A bold circular badge between them reads "${matchPct}% MATCH" in a bright coral/red color (#ff5a5f).
Below, large headline text: "Save $${savings}".
Place the provided "dupli" wordmark image small in the bottom-right corner — preserve its shape and the red dot.
Style: clean, modern e-commerce comparison, high contrast, viral-share-ready.`;

    case 4:
      return `Create a viral Instagram carousel slide, 1:1 square, 1024x1024.
Premium CTA slide on a deep gradient background (coral #ff5a5f to soft pink).
Center-top: render the provided "dupli" wordmark image LARGE (about 40% of frame width), crisp, centered, preserving its exact shape and the red dot on the "i".
Below the wordmark, headline text: "Find your dupe."
Below that, smaller subtext: "Scan any beauty product. Get the cheaper match in seconds."
Near the bottom, render a realistic Apple "Download on the App Store" black badge button.
You may ignore the product reference image for this slide — focus on the wordmark and CTA.
Style: bold, polished, app-launch energy, clean negative space.`;
  }
}

async function generateSlide(input: SlideInput): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const prompt = buildPrompt(input);

  // Build the content with reference images. Slide 3 includes the dupe image.
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: prompt }];

  userContent.push({ type: "image_url", image_url: { url: input.pair.original.imageUrl } });
  if (input.slide === 3) {
    userContent.push({ type: "image_url", image_url: { url: input.pair.dupe.imageUrl } });
  } else {
    // Keep the prompt's "third reference image" indexing consistent by adding a placeholder.
    // For non-slide-3 calls, we shift: original is 1st, wordmark is 2nd.
  }
  userContent.push({ type: "image_url", image_url: { url: input.wordmarkUrl } });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image gen failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned by gateway");
  return `data:image/png;base64,${b64}`;
}

export type SlideResult =
  | { slide: 1 | 2 | 3 | 4; ok: true; dataUrl: string }
  | { slide: 1 | 2 | 3 | 4; ok: false; error: string };

export const generateCarouselSlides = createServerFn({ method: "POST" })
  .inputValidator((data: { pair: DupePair; slides?: Array<1 | 2 | 3 | 4> }) => data)
  .handler(async ({ data }): Promise<{ results: SlideResult[] }> => {
    const slides = data.slides ?? [1, 2, 3, 4];
    const host = getRequestHost();
    const wordmarkUrl = `https://${host}/dupli-wordmark.png`;

    const results = await Promise.all(
      slides.map(async (slide): Promise<SlideResult> => {
        try {
          const dataUrl = await generateSlide({ slide, pair: data.pair, wordmarkUrl });
          return { slide, ok: true, dataUrl };
        } catch (e) {
          return {
            slide,
            ok: false,
            error: e instanceof Error ? e.message : "Unknown error",
          };
        }
      }),
    );

    return { results };
  });
