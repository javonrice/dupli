// Caption generator — UGC-style TikTok caption + exactly 5 community hashtags.
// Kept out of .functions.ts so the LOVABLE_API_KEY fetch stays server-side.

import type { DupePair } from "@/lib/dupe-types";

const HASHTAG_POOL = [
  "#dupe",
  "#dupealert",
  "#dupesoftiktok",
  "#beautydupes",
  "#affordablebeauty",
  "#makeupdupes",
  "#skincaredupes",
  "#luxuryforless",
  "#savemoney",
  "#tiktokmademebuyit",
];

function pickHashtags(pairs: DupePair[]): string[] {
  // Always include #dupe + one category-ish tag, then random fill to 5.
  const text = pairs
    .map((p) => `${p.original.name} ${p.dupe.name}`)
    .join(" ")
    .toLowerCase();
  const category = /serum|cream|moistur|spf|sunscreen|cleanser|retinol|toner/.test(text)
    ? "#skincaredupes"
    : /lip|mascara|foundation|blush|liner|bronz|concealer|powder|gloss/.test(text)
    ? "#makeupdupes"
    : "#beautydupes";

  const must = new Set<string>(["#dupe", category]);
  const rest = HASHTAG_POOL.filter((t) => !must.has(t));
  // Shuffle and pull until we have 5.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = [...must];
  for (const t of rest) {
    if (out.length >= 5) break;
    out.push(t);
  }
  return out.slice(0, 5);
}

export async function generateCaption(pairs: DupePair[]): Promise<{
  caption: string;
  hashtags: string[];
}> {
  const hashtags = pickHashtags(pairs);

  const apiKey = process.env.LOVABLE_API_KEY;
  let body = "";

  if (apiKey) {
    const pairList = pairs
      .map(
        (p, i) =>
          `${i + 1}. ${p.original.brand} ${p.original.name} ($${p.original.priceUsd.toFixed(0)}) → ${p.dupe.brand} ${p.dupe.name} ($${p.dupe.priceUsd.toFixed(0)}), save $${p.savingsUsd.toFixed(0)}`,
      )
      .join("\n");

    const prompt = `You are a UGC creator on TikTok in the beauty dupe community. Write ONE short caption (2-4 short lines, max ~220 chars) for a video showing these dupes:\n${pairList}\n\nRules:\n- Sound like a real person, not an ad. Casual, conversational.\n- Start with a hook like "okay hear me out", "y'all i'm screaming", "stop spending $$$ on", "bestie why is nobody talking about", or "running to grab" — pick one that fits.\n- Mention the savings naturally.\n- No hashtags (they'll be added after).\n- No em dashes. Use plain commas or line breaks.\n- No emojis unless one fits very naturally (max 1).\n- Output ONLY the caption text, no quotes, no preamble.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.9,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        body = (json.choices?.[0]?.message?.content ?? "").trim();
      }
    } catch (e) {
      console.warn("caption gen failed, falling back:", e);
    }
  }

  if (!body) {
    // Fallback if AI unavailable.
    const top = pairs[0];
    body = `okay bestie hear me out\n${top.original.brand} ${top.original.name} is $${top.original.priceUsd.toFixed(0)}\nbut ${top.dupe.brand} dupes it for $${top.dupe.priceUsd.toFixed(0)}\nsave $${top.savingsUsd.toFixed(0)}, run`;
  }

  // Strip stray quotes/em dashes that sneak in.
  body = body.replace(/^["']|["']$/g, "").replace(/—|–/g, ",").trim();

  return { caption: `${body}\n\n${hashtags.join(" ")}`, hashtags };
}
