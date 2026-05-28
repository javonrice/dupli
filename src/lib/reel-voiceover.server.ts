import type { DupePair } from "@/lib/dashboard.functions";

export type ReelSegmentKey =
  | "hook"
  | "reveal_1"
  | "reveal_2"
  | "reveal_3"
  | "reveal_4"
  | "cta";

// CBR MP3 (128kbps) duration estimate from byte length.
export function estimateMp3DurationSec(byteLength: number): number {
  return byteLength / (128_000 / 8);
}

// Use Lovable AI to produce 6 short punchy lines (hook + 4 reveals + cta).
export async function writeScript(
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

  const prompt = `Write a TikTok voiceover script for a dupe-finder app called Dupli. You ARE a Gen-Z beauty UGC creator talking straight to camera — casual, hyped, like you're texting your bestie. Sound HUMAN, not like an ad read.

CRITICAL voice rules (this is for text-to-speech, punctuation literally changes how it sounds):
- NO em dashes, NO en dashes, NO semicolons, NO colons mid-sentence. They make TTS pause weird and sound robotic.
- Use periods and commas only. Short sentences. Natural breath rhythm.
- No parentheses, no quotes, no emojis, no hashtags, no stage directions.
- Write numbers as words when it flows better (say "twenty bucks" not "$20") but keep dollar amounts as digits with the word dollars, like "20 dollars".
- Use filler words a real creator uses: "okay so", "literally", "like", "y'all", "no cause", "bestie", "girl", "I'm telling you", "trust me".
- Contractions always (it's, that's, you're, I'm, don't).

The video shows 4 viral/luxury beauty products and reveals a cheaper dupe for each. For each reveal explain WHY it's a dupe — infer from product names (same active ingredient, same finish, same formula, same shade, same packaging). Sound like you actually use this stuff.

${pairBlock}

Total savings across all 4: $${totalSavings.toFixed(0)} dollars

Return ONLY a JSON object with keys: hook, reveal_1, reveal_2, reveal_3, reveal_4, cta.

- hook: 6–10 words. Open like a real UGC creator. MUST start with one of: "hey y'all", "okay so", "back again with", "no cause y'all", "bestie", "girl listen". Then tease 4 dupes. Example: "hey y'all I found 4 dupes that actually slap."
- reveal_1: 12–22 words. Name the dupe brand, say how much you save in dollars, give one real reason it works (ingredient, finish, formula, shade, packaging) from "${pairs[0].original.name}" vs "${pairs[0].dupe.name}". No dashes.
- reveal_2: same vibe for Pair 2, ${pairs[1].dupe.brand}, ${pairs[1].savingsUsd.toFixed(0)} dollars saved, reason from "${pairs[1].original.name}" vs "${pairs[1].dupe.name}".
- reveal_3: same for Pair 3, ${pairs[2].dupe.brand}, ${pairs[2].savingsUsd.toFixed(0)} dollars saved, reason from "${pairs[2].original.name}" vs "${pairs[2].dupe.name}".
- reveal_4: same for Pair 4, ${pairs[3].dupe.brand}, ${pairs[3].savingsUsd.toFixed(0)} dollars saved, reason from "${pairs[3].original.name}" vs "${pairs[3].dupe.name}".
- cta: 8–12 words. Tell viewers to download Dupli and scan anything. Mention saving about ${totalSavings.toFixed(0)} dollars total. Sound chill, not salesy.

Vary how each reveal starts. Mix in "okay this one", "next up", "and this", "oh and", "wait til you see". No dashes ANYWHERE.

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

  const need: ReelSegmentKey[] = [
    "hook",
    "reveal_1",
    "reveal_2",
    "reveal_3",
    "reveal_4",
    "cta",
  ];

  const tryParse = (s: string): Record<string, string> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, string>) : null;
    } catch {
      return null;
    }
  };

  // Strip code fences, then try direct parse, then largest-brace match.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed = tryParse(cleaned);
  if (!parsed) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }

  const valid =
    parsed && need.every((k) => typeof parsed![k] === "string" && parsed![k].length > 0);

  if (!valid) {
    // Deterministic fallback so reel generation never crashes on bad AI output.
    parsed = buildFallbackScript(pairs);
  }

  return parsed as Record<ReelSegmentKey, string>;
}

function buildFallbackScript(pairs: DupePair[]): Record<ReelSegmentKey, string> {
  const total = pairs.reduce((a, p) => a + p.savingsUsd, 0).toFixed(0);
  const reveal = (p: DupePair) =>
    `${p.dupe.brand} dupes ${p.original.brand} ${p.original.name} for $${p.dupe.priceUsd.toFixed(0)} — basically the same formula for $${p.savingsUsd.toFixed(0)} less.`;
  return {
    hook: "Stop overpaying — I found 4 dupes for viral beauty buys.",
    reveal_1: reveal(pairs[0]),
    reveal_2: reveal(pairs[1]),
    reveal_3: reveal(pairs[2]),
    reveal_4: reveal(pairs[3]),
    cta: `Download Dupli, scan anything, save about $${total} total.`,
  };
}


// Jessica — young, expressive, very TikTok-friendly read.
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";

export async function tts(
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
