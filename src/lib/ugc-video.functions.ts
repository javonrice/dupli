import { createServerFn } from "@tanstack/react-start";
import type { DupePair } from "@/lib/dashboard.functions";

// HeyGen Product Placement is driven via the Template API. The user creates a
// "Product Placement" video once in the HeyGen UI, saves it as a Template
// with two variables — `product_image` (image) and `script` (text) — and
// pastes the template_id into HEYGEN_TEMPLATE_ID. Variable names below MUST
// match the template's variable names exactly.
const PRODUCT_IMAGE_VAR = "product_image";
const SCRIPT_VAR = "script";

// ---------- Script generation via Lovable AI ----------

export const generateUgcScript = createServerFn({ method: "POST" })
  .inputValidator((data: { pair: DupePair }) => data)
  .handler(async ({ data }): Promise<{ script: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { pair } = data;
    const prompt = `Write a short, casual UGC voiceover (2 sentences, max 35 words total, conversational TikTok-creator tone, no hashtags, no emojis). The creator is HOLDING UP the dupe product to the camera and showing it off as a cheaper alternative to a luxury original.

Original: ${pair.original.brand} ${pair.original.name} — $${pair.original.priceUsd.toFixed(0)}
Dupe being held: ${pair.dupe.brand} ${pair.dupe.name} — $${pair.dupe.priceUsd.toFixed(0)}
Match: ${pair.matchPct}%
Savings: $${pair.savingsUsd.toFixed(0)}

Open with a hook like "Ok I had to show you this" or "Stop sleeping on this". Mention the dupe by brand. Return ONLY the script text, nothing else.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Script generation failed (${res.status}): ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const script = json.choices?.[0]?.message?.content?.trim();
    if (!script) throw new Error("AI returned no script");
    return { script };
  });

// ---------- HeyGen submit (Product Placement via Template API) ----------

export type SubmitUgcResult = { videoId: string; script: string };

export const submitUgcVideo = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { script: string; productImageUrl: string }) => data,
  )
  .handler(async ({ data }): Promise<SubmitUgcResult> => {
    const heygenKey = process.env.HEYGEN_API_KEY;
    if (!heygenKey) throw new Error("HEYGEN_API_KEY is not configured");
    const templateId = process.env.HEYGEN_TEMPLATE_ID;
    if (!templateId) {
      throw new Error(
        "HEYGEN_TEMPLATE_ID is not configured. In HeyGen, build a Product Placement video, save it as a Template with two variables named `product_image` (image) and `script` (text), then paste the template ID into the HEYGEN_TEMPLATE_ID secret.",
      );
    }

    const body = {
      caption: false,
      title: "Dupli UGC",
      variables: {
        [PRODUCT_IMAGE_VAR]: {
          name: PRODUCT_IMAGE_VAR,
          type: "image",
          properties: {
            url: data.productImageUrl,
            fit: "contain",
          },
        },
        [SCRIPT_VAR]: {
          name: SCRIPT_VAR,
          type: "text",
          properties: { content: data.script },
        },
      },
    };

    const res = await fetch(
      `https://api.heygen.com/v2/template/${encodeURIComponent(templateId)}/generate`,
      {
        method: "POST",
        headers: {
          "X-Api-Key": heygenKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HeyGen submit failed (${res.status}): ${text.slice(0, 500)}`);
    }
    let parsed: { data?: { video_id?: string }; error?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`HeyGen returned non-JSON: ${text.slice(0, 200)}`);
    }
    const videoId = parsed.data?.video_id;
    if (!videoId) {
      throw new Error(
        `HeyGen submit succeeded but no video_id: ${JSON.stringify(parsed).slice(0, 300)}`,
      );
    }
    return { videoId, script: data.script };
  });

// ---------- HeyGen poll ----------

export type PollUgcResult =
  | { status: "pending" | "processing"; videoId: string }
  | { status: "completed"; videoId: string; videoUrl: string }
  | { status: "failed"; videoId: string; error: string };

export const pollUgcVideo = createServerFn({ method: "POST" })
  .inputValidator((data: { videoId: string }) => data)
  .handler(async ({ data }): Promise<PollUgcResult> => {
    const heygenKey = process.env.HEYGEN_API_KEY;
    if (!heygenKey) throw new Error("HEYGEN_API_KEY is not configured");

    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(data.videoId)}`,
      { headers: { "X-Api-Key": heygenKey } },
    );

    const text = await res.text();
    if (!res.ok) {
      return {
        status: "failed",
        videoId: data.videoId,
        error: `HeyGen status check failed (${res.status}): ${text.slice(0, 300)}`,
      };
    }
    let parsed: {
      data?: {
        status?: string;
        video_url?: string;
        error?: { message?: string; detail?: string } | string | null;
      };
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        status: "failed",
        videoId: data.videoId,
        error: `HeyGen returned non-JSON status: ${text.slice(0, 200)}`,
      };
    }

    const status = parsed.data?.status ?? "pending";
    if (status === "completed") {
      const url = parsed.data?.video_url;
      if (!url) {
        return { status: "failed", videoId: data.videoId, error: "Completed but no video_url" };
      }
      return { status: "completed", videoId: data.videoId, videoUrl: url };
    }
    if (status === "failed") {
      const err = parsed.data?.error;
      const msg =
        typeof err === "string"
          ? err
          : err?.message || err?.detail || JSON.stringify(err) || "HeyGen reported failed";
      return { status: "failed", videoId: data.videoId, error: msg };
    }
    return {
      status: status === "processing" ? "processing" : "pending",
      videoId: data.videoId,
    };
  });
