import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadProductImageDataUrl } from "@/lib/product-images.server";
import type { DupePair, SlideResult } from "@/lib/dupe-types";




// Pick a random high-match dupe pair where both products have images + prices
// and the pair hasn't been generated in the last 30 days.
export const pickRandomDupePair = createServerFn({ method: "POST" }).handler(
  async (): Promise<DupePair> => {
    // Pull a candidate window and pick randomly.


    // Pull a candidate window and pick randomly.

    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("dupes")
      .select(
        `id, overall_match,
         original:products!dupes_original_product_id_fkey ( id, brand_name, product_name, image_url, cached_image_url, lowest_price_usd ),
         dupe:products!dupes_dupe_product_id_fkey ( id, brand_name, product_name, image_url, cached_image_url, lowest_price_usd )`,
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
        cached_image_url: string | null;
        lowest_price_usd: number | null;
      } | null;
      const d = row.dupe as unknown as {
        id: string;
        brand_name: string;
        product_name: string;
        image_url: string | null;
        cached_image_url: string | null;
        lowest_price_usd: number | null;
      } | null;
      if (!o || !d) return false;
      if (!o.cached_image_url || !d.cached_image_url) return false;
      if (o.lowest_price_usd == null || d.lowest_price_usd == null) return false;
      return Number(d.lowest_price_usd) < Number(o.lowest_price_usd);
    });

    if (usable.length === 0) {
      throw new Error("No locally stored product pairs found yet. Scan and save a product first.");
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
      cached_image_url: string | null;
      lowest_price_usd: number;
    };
    const d = picked.dupe as unknown as {
      id: string;
      brand_name: string;
      product_name: string;
      image_url: string;
      cached_image_url: string | null;
      lowest_price_usd: number;
    };
    // Record this generation so we don't repeat soon.
    await supabaseAdmin
      .from("dashboard_generations")
      .insert({ original_product_id: o.id, dupe_product_id: d.id });

    // Cache product images in our own storage so downstream services
    // (fal.ai, Nano Banana, OG renderers, etc.) don't have to reach the
    // original source CDN — which sometimes 403s third-party clients.
    const originalImageUrl = o.cached_image_url;
    const dupeImageUrl = d.cached_image_url;
    if (!originalImageUrl || !dupeImageUrl) {
      throw new Error("Selected pair is missing locally stored images");
    }

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

// Pick N distinct random dupe pairs (default 4) for a multi-product reel.
export const pickRandomDupePairs = createServerFn({ method: "POST" })
  .inputValidator((data: { count?: number } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<DupePair[]> => {
    const count = Math.max(1, Math.min(8, data.count ?? 4));

    // SkinSort already classified these as dupes — no match-score gating.
    // Pull a wide pool so each click can sample from across the catalog.
    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("dupes")
      .select(
        `id, overall_match,
         original:products!dupes_original_product_id_fkey ( id, brand_name, product_name, image_url, cached_image_url, lowest_price_usd ),
         dupe:products!dupes_dupe_product_id_fkey ( id, brand_name, product_name, image_url, cached_image_url, lowest_price_usd )`,
      )
      .limit(5000);

    if (qErr) throw new Error(`Failed to load dupe candidates: ${qErr.message}`);
    if (!candidates) throw new Error("No dupe candidates found");

    type Row = (typeof candidates)[number];
    type Prod = {
      id: string;
      brand_name: string;
      product_name: string;
      image_url: string | null;
      cached_image_url: string | null;
      lowest_price_usd: number | null;
    };
    const pickImage = (p: Prod) => p.cached_image_url ?? p.image_url ?? null;

    const usable = (candidates as Row[]).filter((row) => {
      const o = row.original as unknown as Prod | null;
      const d = row.dupe as unknown as Prod | null;
      if (!o || !d) return false;
      if (!pickImage(o) || !pickImage(d)) return false;
      if (o.lowest_price_usd == null || d.lowest_price_usd == null) return false;
      return Number(d.lowest_price_usd) < Number(o.lowest_price_usd);
    });

    if (usable.length < count) {
      throw new Error(
        `Need at least ${count} usable dupe pairs, only found ${usable.length}. Ingest more product prices/images.`,
      );
    }

    // Exclude any PRODUCT (original or dupe) used in the last 30 days,
    // not just exact pair combinations. Every click should serve fresh products.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("dashboard_generations")
      .select("original_product_id, dupe_product_id")
      .gte("created_at", since);
    const recentProducts = new Set<string>();
    for (const r of recent ?? []) {
      recentProducts.add(r.original_product_id);
      recentProducts.add(r.dupe_product_id);
    }

    const shuffle = <T>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);

    const fresh = usable.filter((row) => {
      const o = row.original as unknown as Prod;
      const d = row.dupe as unknown as Prod;
      return !recentProducts.has(o.id) && !recentProducts.has(d.id);
    });

    const primary =
      fresh.length >= count ? shuffle(fresh) : shuffle(usable);

    const picked: Row[] = [];
    const seenOriginals = new Set<string>();
    const seenDupes = new Set<string>();
    for (const row of primary) {
      const o = row.original as unknown as Prod;
      const d = row.dupe as unknown as Prod;
      if (seenOriginals.has(o.id) || seenDupes.has(d.id)) continue;
      picked.push(row);
      seenOriginals.add(o.id);
      seenDupes.add(d.id);
      if (picked.length === count) break;
    }
    if (picked.length < count) {
      for (const row of primary) {
        if (picked.includes(row)) continue;
        picked.push(row);
        if (picked.length === count) break;
      }
    }

    // Record immediately so failed downstream steps don't cause repeats.
    const { error: insErr } = await supabaseAdmin
      .from("dashboard_generations")
      .insert(
        picked.map((row) => {
          const o = row.original as unknown as Prod;
          const d = row.dupe as unknown as Prod;
          return { original_product_id: o.id, dupe_product_id: d.id };
        }),
      );
    if (insErr) {
      throw new Error(`Failed to record generation: ${insErr.message}`);
    }

    return picked.map((row) => {
      const o = row.original as unknown as Prod;
      const d = row.dupe as unknown as Prod;
      return {
        pairId: row.id,
        matchPct: row.overall_match ?? 0,
        original: {
          id: o.id,
          brand: o.brand_name,
          name: o.product_name,
          imageUrl: pickImage(o)!,
          priceUsd: Number(o.lowest_price_usd),
        },
        dupe: {
          id: d.id,
          brand: d.brand_name,
          name: d.product_name,
          imageUrl: pickImage(d)!,
          priceUsd: Number(d.lowest_price_usd),
        },
        savingsUsd: Number(o.lowest_price_usd) - Number(d.lowest_price_usd),
      };
    });
  });




async function pickLatestSavedScanPair(): Promise<DupePair | null> {
  const { data: scans, error } = await supabaseAdmin
    .from("scans")
    .select("id, original_brand, original_product_name, dupe_brand, dupe_product_name, match_score, thumbnail_data_url, analysis, created_at")
    .not("thumbnail_data_url", "is", null)
    .not("dupe_brand", "is", null)
    .not("dupe_product_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.warn("pickLatestSavedScanPair: scan lookup failed", error);
    return null;
  }

  for (const scan of scans ?? []) {
    const analysis = scan.analysis as {
      original?: { estimatedPriceUsd?: number };
      dupe?: { estimatedPriceUsd?: number };
    } | null;
    const originalPrice = Number(analysis?.original?.estimatedPriceUsd);
    const dupePrice = Number(analysis?.dupe?.estimatedPriceUsd);
    if (!scan.thumbnail_data_url || !Number.isFinite(originalPrice) || !Number.isFinite(dupePrice)) {
      continue;
    }

    const imageUrl = await uploadProductImageDataUrl({
      dataUrl: scan.thumbnail_data_url,
      folder: `scan-${scan.id}`,
      name: `${scan.original_brand}-${scan.original_product_name}`,
    });

    return {
      pairId: `scan:${scan.id}`,
      matchPct: scan.match_score ?? 70,
      original: {
        id: `scan:${scan.id}:original`,
        brand: scan.original_brand,
        name: scan.original_product_name,
        imageUrl,
        priceUsd: originalPrice,
      },
      dupe: {
        id: `scan:${scan.id}:dupe`,
        brand: scan.dupe_brand ?? "Dupe",
        name: scan.dupe_product_name ?? "Recommended dupe",
        imageUrl,
        priceUsd: dupePrice,
      },
      savingsUsd: Math.max(originalPrice - dupePrice, 0),
    };
  }

  return null;
}

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
