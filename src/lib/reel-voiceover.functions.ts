import { createServerFn } from "@tanstack/react-start";
import type { DupePair, ReelScript, ReelSegmentKey } from "@/lib/dupe-types";
import { writeScript, tts } from "@/lib/reel-voiceover.server";

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
