import { createServerFn } from "@tanstack/react-start";
import type { DupePair } from "@/lib/dashboard.functions";

// Default HeyGen stock avatar + voice. These are widely-available defaults; if
// they don't exist on a given HeyGen account the API error is surfaced verbatim
// so the user can swap them in the UI later.
const DEFAULT_AVATAR_ID = "Daisy-inskirt-20220818";
const DEFAULT_VOICE_ID = "2d5b0e6cf36f460aa7fc47e3eee4ba54";

// ---------- Script generation via Lovable AI ----------

export const generateUgcScript = createServerFn({ method: "POST" })
  .inputValidator((data: { pair: DupePair }) => data)
  .handler(async ({ data }): Promise<{ script: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { pair } = data;
    const prompt = `Write a short, casual "honest UGC review" voiceover (2 sentences, max 35 words total, conversational tone like a TikTok creator, no hashtags, no emojis).
The creator just discovered a cheaper dupe.

Original: ${pair.original.brand} ${pair.original.name} — $${pair.original.priceUsd.toFixed(0)}
Dupe: ${pair.dupe.brand} ${pair.dupe.name} — $${pair.dupe.priceUsd.toFixed(0)}
Match: ${pair.matchPct}%
Savings: $${pair.savingsUsd.toFixed(0)}

Return ONLY the script text, nothing else.`;

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

// ---------- HeyGen submit ----------

export type SubmitUgcResult = { videoId: string; script: string };

export const submitUgcVideo = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { script: string; avatarId?: string; voiceId?: string }) => data,
  )
  .handler(async ({ data }): Promise<SubmitUgcResult> => {
    const heygenKey = process.env.HEYGEN_API_KEY;
    if (!heygenKey) throw new Error("HEYGEN_API_KEY is not configured");

    const body = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: data.avatarId ?? DEFAULT_AVATAR_ID,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: data.script,
            voice_id: data.voiceId ?? DEFAULT_VOICE_ID,
          },
          background: { type: "color", value: "#f5f5f5" },
        },
      ],
      dimension: { width: 720, height: 1280 },
    };

    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: {
        "X-Api-Key": heygenKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HeyGen submit failed (${res.status}): ${text.slice(0, 400)}`);
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
      // Surface the real error instead of swallowing it.
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
