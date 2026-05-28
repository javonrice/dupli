import { createServerFn } from "@tanstack/react-start";
import type { DupePair } from "@/lib/dashboard.functions";

export type ReelSegmentKey =
  | "hook"
  | "reveal_1"
  | "reveal_2"
  | "reveal_3"
  | "reveal_4"
  | "cta";

export const REVEAL_KEYS: ReelSegmentKey[] = [
  "reveal_1",
  "reveal_2",
  "reveal_3",
  "reveal_4",
];

export type ReelSegment = {
  key: ReelSegmentKey;
  text: string;
  audioDataUrl: string;
  durationSec: number;
};

export type ReelScript = {
  pairs: DupePair[]; // length 4
  segments: ReelSegment[]; // hook + 4 reveals + cta
};

// CBR MP3 (128kbps) duration estimate from byte length.
function estimateMp3DurationSec(byteLength: number): number {
  return byteLength / (128_000 / 8);
}

// Use Lovable AI to produce 6 short punchy lines (hook + 4 reveals + cta).
async function writeScript(
  pairs: DupePair[],
): Promise<Record<ReelSegmentKey, string>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const totalSavings = pairs.reduce((acc, p) => acc + p.savingsUsd, 0);

  const pairBlock = pairs
    .map(
      (p, i) =>
        `Pair ${i + 1}:
  Original: ${p.original.brand} ${p.original.name} — $${p.original.priceUsd.toFixed(0)}
  Dupe: ${p.dupe.brand} ${p.dupe.name} — $${p.dupe.priceUsd.toFixed(0)}
  Match: ${p.matchPct}%, Save $${p.savingsUsd.toFixed(0)}`,
    )
    .join("\n\n");

  const prompt = `Write a TikTok voiceover script for a dupe-finder app called Dupli. Tone: trendy Gen-Z girl, casual, conversational, slightly hyped — like a beauty TikToker doing a "stop overpaying" video. No emojis, no hashtags, no quotes, no stage directions.

The video shows 4 viral/luxury beauty products and reveals a cheaper dupe for each one. For each reveal you must briefly explain WHY it's a dupe — infer from the product names (same active ingredient, same finish, same formula type, same shade range, same packaging, etc.). Sound informed, not generic. Never say "similar product" or "great alternative."

${pairBlock}

Total savings across all 4: $${totalSavings.toFixed(0)}

Return ONLY a JSON object with keys: hook, reveal_1, reveal_2, reveal_3, reveal_4, cta.

- hook: 5–9 words. SCROLL-STOPPING opener that tees up "4 dupes". Name the number, make a bold promise. Examples: "I dupe'd 4 viral products you actually buy.", "4 overpriced beauty buys. 4 cheaper twins.", "Stop overpaying for these 4 — I found dupes."
- reveal_1: 12–20 words. Shape: "[${pairs[0].dupe.brand}] dupes it for $${pairs[0].savingsUsd.toFixed(0)} less — [one short reason it works]." Reason must reference a concrete shared trait (ingredient, finish, formula, shade, packaging) inferred from "${pairs[0].original.name}" vs "${pairs[0].dupe.name}".
- reveal_2: same shape for Pair 2 — ${pairs[1].dupe.brand}, $${pairs[1].savingsUsd.toFixed(0)} savings, reason from "${pairs[1].original.name}" vs "${pairs[1].dupe.name}".
- reveal_3: same shape for Pair 3 — ${pairs[2].dupe.brand}, $${pairs[2].savingsUsd.toFixed(0)} savings, reason from "${pairs[2].original.name}" vs "${pairs[2].dupe.name}".
- reveal_4: same shape for Pair 4 — ${pairs[3].dupe.brand}, $${pairs[3].savingsUsd.toFixed(0)} savings, reason from "${pairs[3].original.name}" vs "${pairs[3].dupe.name}".
- cta: 6–10 words. Tell viewers to download Dupli and scan anything. Mention total saved ~$${totalSavings.toFixed(0)}.

Vary the phrasing — don't start every reveal the same way. Mix in casual connectors like "literally", "basically", "same vibe", "same formula", "for real".

Example shape: {"hook":"...","reveal_1":"...","reveal_2":"...","reveal_3":"...","reveal_4":"...","cta":"..."}`;


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
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Script JSON parse failed");
    parsed = JSON.parse(m[0]);
  }
  const need: ReelSegmentKey[] = [
    "hook",
    "reveal_1",
    "reveal_2",
    "reveal_3",
    "reveal_4",
    "cta",
  ];
  for (const k of need) {
    if (!parsed[k] || typeof parsed[k] !== "string") {
      throw new Error(`Script missing key: ${k}`);
    }
  }
  return parsed as Record<ReelSegmentKey, string>;
}
// Jessica — young, expressive, very TikTok-friendly read.
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
async function tts(
  text: string,
): Promise<{ audioDataUrl: string; durationSec: number }> {
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
          stability: 0.35,
          similarity_boost: 0.85,
          style: 0.55,
          use_speaker_boost: true,
          speed: 1.0,
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
  .inputValidator((data: { pairs: DupePair[] }) => {
    if (!Array.isArray(data.pairs) || data.pairs.length !== 4) {
      throw new Error("generateReelScript expects exactly 4 pairs");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ReelScript> => {
    const lines = await writeScript(data.pairs);
    const keys: ReelSegmentKey[] = [
      "hook",
      "reveal_1",
      "reveal_2",
      "reveal_3",
      "reveal_4",
      "cta",
    ];
    const segments = await Promise.all(
      keys.map(async (key) => {
        const { audioDataUrl, durationSec } = await tts(lines[key]);
        return { key, text: lines[key], audioDataUrl, durationSec };
      }),
    );
    return { pairs: data.pairs, segments };
  });
