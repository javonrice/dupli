// Shared pipeline: pick pairs → script → render → upload → save record.
// Used by both the single-video UI and the batch generator.

import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { renderReelToMp4, type RenderProgress, type FrameFailure } from "@/lib/render-reel";
import {
  startLambdaRender,
  getLambdaRenderProgress,
} from "@/lib/lambda-render.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import {
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
  audioStartFrames,
} from "@/remotion/DupeReel";

  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
  audioStartFrames,
} from "@/remotion/DupeReel";

export type RenderAndSaveArgs = {
  script: ReelScript;
  pairs: DupePair[];
  playerRef: RefObject<PlayerRef | null>;
  captureEl: HTMLElement;
  saveRecord: (input: {
    data: {
      storagePath: string;
      thumbnailUrl: string | null;
      pairs: DupePair[];
      durationSec: number;
    };
  }) => Promise<unknown>;
  onProgress?: (p: RenderProgress) => void;
  onDebug?: (
    entry: FrameFailure | { type: "image"; src: string; reason: string },
  ) => void;
};

export type RenderAndSaveResult = {
  blob: Blob;
  storagePath: string | null;
  saved: boolean;
};

export async function renderAndSaveReel({
  script,
  pairs,
  playerRef,
  captureEl,
  saveRecord,
  onProgress,
  onDebug,
}: RenderAndSaveArgs): Promise<RenderAndSaveResult> {
  const totalFrames = totalDurationInFrames(script);

  const blob = await renderReelToMp4({
    playerRef,
    captureEl,
    script,
    totalFrames,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    segmentStartFrames: audioStartFrames(script),
    onProgress,
    onDebug,
  });

  // Upload to user-videos bucket (RLS scoped by first folder = user_id).
  let storagePath: string | null = null;
  let saved = false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const fileId = crypto.randomUUID();
      storagePath = `${userId}/${fileId}.mp4`;
      const { error: upErr } = await supabase.storage
        .from("user-videos")
        .upload(storagePath, blob, {
          contentType: "video/mp4",
          upsert: false,
        });
      if (upErr) {
        console.warn("upload failed:", upErr.message);
        storagePath = null;
      } else {
        await saveRecord({
          data: {
            storagePath,
            thumbnailUrl: pairs[0]?.original.imageUrl ?? null,
            pairs,
            durationSec: totalFrames / FPS,
          },
        });
        saved = true;
      }
    }
  } catch (e) {
    console.warn("save record failed:", e);
  }

  return { blob, storagePath, saved };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
