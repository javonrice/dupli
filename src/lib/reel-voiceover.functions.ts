import { createServerFn } from "@tanstack/react-start";
import type { DupePair } from "@/lib/dashboard.functions";

export type ReelSegmentKey = "hook" | "scan" | "compare" | "cta";

export type ReelSegment = {
  key: ReelSegmentKey;
  text: string;
  audioDataUrl: string;
  durationSec: number;
};

export type ReelScript = {
  pair: DupePair;
  segments: ReelSegment[];
};

// CBR MP3 (128kbps) duration estimate from byte length.
// ElevenLabs default `mp3_44100_128` is 128kbps constant.
function estimateMp3DurationSec(byteLength: number): number {
  return byteLength / (128_000 / 8);
}

// Use Lovable AI to produce 4 short punchy lines aligned to the scene beats.
async function writeScript(pair: DupePair): Promise<Record<ReelSegmentKey, string>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const prompt = `Write a 4-line TikTok voiceover script for a dupe-finder app. Each line must be SHORT (5–10 words), conversational, no emojis, no hashtags, no quotes.

Original: ${pair.original.brand} ${pair.original.name} — $${pair.original.priceUsd.toFixed(0)}
Dupe: ${pair.dupe.brand} ${pair.dupe.name} — $${pair.dupe.priceUsd.toFixed(0)}
Match: ${pair.matchPct}%
Savings: $${pair.savingsUsd.toFixed(0)}

Return ONLY a JSON object with keys: hook, scan, compare, cta.
- hook: a stop-the-scroll line about the original being overpriced
- scan: tease that you scanned it for a dupe
- compare: reveal the dupe brand and the savings number
- cta: tell them to download Dupli

Example shape: {"hook":"...", "scan":"...", "compare":"...", "cta":"..."}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Script gen failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to salvage if model wrapped in code fences
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Script JSON parse failed");
    parsed = JSON.parse(m[0]);
  }
  const need: ReelSegmentKey[] = ["hook", "scan", "compare", "cta"];
  for (const k of need) {
    if (!parsed[k] || typeof parsed[k] !== "string") {
      throw new Error(`Script missing key: ${k}`);
    }
  }
  return parsed as Record<ReelSegmentKey, string>;
}

// ElevenLabs TTS — returns base64 MP3 + estimated duration.
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
async function tts(text: string): Promise<{ audioDataUrl: string; durationSec: number }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
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
  const buf = await res.arrayBuffer();
  const durationSec = estimateMp3DurationSec(buf.byteLength);
  const base64 = Buffer.from(buf).toString("base64");
  return {
    audioDataUrl: `data:audio/mpeg;base64,${base64}`,
    durationSec,
  };
}

export const generateReelScript = createServerFn({ method: "POST" })
  .inputValidator((data: { pair: DupePair }) => data)
  .handler(async ({ data }): Promise<ReelScript> => {
    const lines = await writeScript(data.pair);
    const keys: ReelSegmentKey[] = ["hook", "scan", "compare", "cta"];
    const segments = await Promise.all(
      keys.map(async (key) => {
        const { audioDataUrl, durationSec } = await tts(lines[key]);
        return { key, text: lines[key], audioDataUrl, durationSec };
      }),
    );
    return { pair: data.pair, segments };
  });
