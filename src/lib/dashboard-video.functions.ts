import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import type { DupePair } from "@/lib/dashboard.functions";

// ---------- Script ----------

export type VideoScript = {
  hook: string;
  scan: string;
  results: string;
  cta: string;
};

export function buildScript(pair: DupePair): VideoScript {
  return {
    hook: `POV: you almost paid $${pair.original.priceUsd.toFixed(0)} for ${pair.original.brand}.`,
    scan: `But Dupli scanned it and found something wild.`,
    results: `${pair.dupe.brand} — a ${pair.matchPct} percent match for just $${pair.dupe.priceUsd.toFixed(0)}.`,
    cta: `Scan anything. Save everything. Dupli.`,
  };
}

// ---------- ElevenLabs voiceover with timestamps ----------

const JESSICA_VOICE_ID = "cgSgspJ2msm6clMCkdW9";

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type VoiceoverResult = {
  audioBase64: string; // mp3
  totalDurationSec: number;
  sceneDurations: [number, number, number, number]; // hook, scan, results, cta
};

export const generateVoiceover = createServerFn({ method: "POST" })
  .inputValidator((data: { script: VideoScript }) => data)
  .handler(async ({ data }): Promise<VoiceoverResult> => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

    const { script } = data;
    // Use distinct separators we can find back in the alignment characters.
    const lines = [script.hook, script.scan, script.results, script.cta];
    const text = lines.join("\n\n");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${JESSICA_VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.55,
            use_speaker_boost: true,
            speed: 1.05,
          },
        }),
      },
    );

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`ElevenLabs failed (${res.status}): ${t.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      audio_base64: string;
      alignment: Alignment;
    };

    const align = json.alignment;
    // Find scene boundaries by walking the script lines and mapping their end positions to alignment.
    // Build a flat character string from alignment to align indices precisely.
    const flat = align.characters.join("");
    const ends: number[] = [];
    let cursor = 0;
    for (const line of lines) {
      const idx = flat.indexOf(line, cursor);
      if (idx === -1) {
        // Fallback: split evenly
        ends.length = 0;
        break;
      }
      const endIdx = idx + line.length - 1;
      ends.push(align.character_end_times_seconds[endIdx] ?? 0);
      cursor = endIdx + 1;
    }

    const totalDuration =
      align.character_end_times_seconds[align.character_end_times_seconds.length - 1] ?? 15;

    let sceneDurations: [number, number, number, number];
    if (ends.length === 4) {
      sceneDurations = [
        ends[0],
        ends[1] - ends[0],
        ends[2] - ends[1],
        Math.max(totalDuration - ends[2], 1.5),
      ];
    } else {
      const each = totalDuration / 4;
      sceneDurations = [each, each, each, each];
    }

    // Pad scene 2 minimum so the scan clip has time to read
    if (sceneDurations[1] < 2.5) {
      const need = 2.5 - sceneDurations[1];
      sceneDurations[1] = 2.5;
      // Steal from scene 4 (CTA) tail padding
      sceneDurations[3] = Math.max(sceneDurations[3] - need, 1);
    }

    return {
      audioBase64: json.audio_base64,
      totalDurationSec: sceneDurations.reduce((a, b) => a + b, 0),
      sceneDurations,
    };
  });

// ---------- fal.ai Seedance image-to-video (scan clip) ----------

export type ScanClipResult = {
  videoUrl: string;
};

export const generateScanClip = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { imageUrl: string; productName: string; brand: string }) => data,
  )
  .handler(async ({ data }): Promise<ScanClipResult> => {
    const falKey = process.env.FAL_KEY;
    if (!falKey) throw new Error("FAL_KEY not configured");

    const prompt = `A hand holding a smartphone scanning the ${data.brand} ${data.productName} product. The phone camera viewfinder shows the product with a glowing scanner bracket overlay sweeping across it. Cinematic beauty-aisle lighting, smooth camera motion, photorealistic, vertical 9:16.`;

    // Submit job
    const submitRes = await fetch(
      "https://queue.fal.run/fal-ai/bytedance/seedance/v1/lite/image-to-video",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_url: data.imageUrl,
          resolution: "720p",
          duration: "5",
          aspect_ratio: "9:16",
          camera_fixed: false,
        }),
      },
    );

    if (!submitRes.ok) {
      const t = await submitRes.text().catch(() => "");
      throw new Error(`fal.ai submit failed (${submitRes.status}): ${t.slice(0, 300)}`);
    }

    const submitted = (await submitRes.json()) as {
      request_id: string;
      status_url?: string;
      response_url?: string;
    };

    const statusUrl =
      submitted.status_url ??
      `https://queue.fal.run/fal-ai/bytedance/seedance/requests/${submitted.request_id}/status`;
    const responseUrl =
      submitted.response_url ??
      `https://queue.fal.run/fal-ai/bytedance/seedance/requests/${submitted.request_id}`;

    // Poll up to ~3 minutes
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const sres = await fetch(statusUrl, {
        headers: { Authorization: `Key ${falKey}` },
      });
      if (!sres.ok) continue;
      const sjson = (await sres.json()) as { status: string };
      if (sjson.status === "COMPLETED") {
        const fres = await fetch(responseUrl, {
          headers: { Authorization: `Key ${falKey}` },
        });
        if (!fres.ok) {
          const t = await fres.text().catch(() => "");
          throw new Error(`fal.ai fetch result failed: ${t.slice(0, 300)}`);
        }
        const fjson = (await fres.json()) as { video?: { url?: string } };
        const url = fjson.video?.url;
        if (!url) throw new Error("fal.ai returned no video url");
        return { videoUrl: url };
      }
      if (sjson.status === "FAILED") {
        throw new Error("fal.ai job failed");
      }
    }
    throw new Error("fal.ai job timed out");
  });

// ---------- Stills via Nano Banana ----------

type StillSlide = "hook" | "results" | "cta";

function buildStillPrompt(
  slide: StillSlide,
  pair: DupePair,
): string {
  const orig = pair.original;
  const dupe = pair.dupe;
  switch (slide) {
    case "hook":
      return `Create a vertical 9:16 social video frame, 1080x1920.
Hero shot of "${orig.brand} ${orig.name}" (use provided product image) on a premium pastel pink studio backdrop. Large bold sans-serif overlay text near top: "Still paying $${orig.priceUsd.toFixed(0)}?". Place provided "dupli" wordmark small in bottom-right, preserving its red dot. Glossy editorial beauty style, very high contrast.`;
    case "results":
      return `Create a vertical 9:16 social video frame, 1080x1920.
Side-by-side product comparison on a clean off-white background. LEFT: "${orig.brand} ${orig.name}" (first provided product image) labeled "ORIGINAL $${orig.priceUsd.toFixed(0)}". RIGHT: "${dupe.brand} ${dupe.name}" (second provided product image) labeled "DUPE $${dupe.priceUsd.toFixed(0)}". A bold circular badge between them: "${pair.matchPct}% MATCH" in coral red. Below, large headline: "Save $${pair.savingsUsd.toFixed(0)}". Place "dupli" wordmark small in bottom-right.`;
    case "cta":
      return `Create a vertical 9:16 social video frame, 1080x1920.
Premium CTA frame on a deep gradient background (coral #ff5a5f to soft pink). Center: render the provided "dupli" wordmark image LARGE (about 50% of frame width), crisp, preserving its exact shape and the red dot. Below the wordmark: "Find your dupe." Smaller subtext below: "Scan any beauty product." Near bottom, a realistic Apple "Download on the App Store" black badge. Ignore product reference image; focus on wordmark and CTA.`;
  }
}

export type StillResult = {
  slide: StillSlide;
  imageBase64: string;
};

async function generateOneStill(
  slide: StillSlide,
  pair: DupePair,
  wordmarkUrl: string,
): Promise<StillResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: buildStillPrompt(slide, pair) }];

  userContent.push({ type: "image_url", image_url: { url: pair.original.imageUrl } });
  if (slide === "results") {
    userContent.push({ type: "image_url", image_url: { url: pair.dupe.imageUrl } });
  }
  userContent.push({ type: "image_url", image_url: { url: wordmarkUrl } });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Still gen failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return { slide, imageBase64: b64 };
}

export const generateVideoStills = createServerFn({ method: "POST" })
  .inputValidator((data: { pair: DupePair }) => data)
  .handler(async ({ data }): Promise<{ stills: StillResult[] }> => {
    const host = getRequestHost();
    const wordmarkUrl = `https://${host}/dupli-wordmark.png`;
    const slides: StillSlide[] = ["hook", "results", "cta"];
    const stills = await Promise.all(
      slides.map((s) => generateOneStill(s, data.pair, wordmarkUrl)),
    );
    return { stills };
  });

// ---------- Proxy fal.ai video so the browser can fetch without CORS ----------

export const fetchScanClipBytes = createServerFn({ method: "POST" })
  .inputValidator((data: { videoUrl: string }) => data)
  .handler(async ({ data }): Promise<{ base64: string }> => {
    const res = await fetch(data.videoUrl);
    if (!res.ok) throw new Error(`Failed to fetch scan clip: ${res.status}`);
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { base64 };
  });
