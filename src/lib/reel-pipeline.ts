// Shared pipeline: pick pairs → script → render → upload → save record.
// Used by both the single-video UI and the batch generator.

import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { renderReelToMp4, type RenderProgress, type FrameFailure } from "@/lib/render-reel";
import { startLambdaRender, getLambdaRenderProgress } from "@/lib/lambda-render.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import { FPS, WIDTH, HEIGHT, totalDurationInFrames, audioStartFrames } from "@/remotion/DupeReel";

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
  onDebug?: (entry: FrameFailure | { type: "image"; src: string; reason: string }) => void;
};

export type RenderAndSaveResult = {
  blob: Blob;
  storagePath: string | null;
  saved: boolean;
};

async function getCurrentUserIdFromSession(timeoutMs = 5000): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) return userId;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

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
    const userId = await getCurrentUserIdFromSession();
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

export type RenderAndSaveLambdaArgs = {
  script: ReelScript;
  pairs: DupePair[];
  saveRecord: RenderAndSaveArgs["saveRecord"];
  onProgress?: (p: RenderProgress) => void;
};

// Upload one data: URL to user-videos storage and return a signed URL.
// Lambda's headless Chrome fetches over HTTPS so a signed URL works fine,
// and we avoid blowing past Lambda's 256 KB inputProps limit.
async function uploadDataUrl(
  dataUrl: string,
  userId: string,
  ext: string,
  contentType: string,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${userId}/render-tmp/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("user-videos")
    .upload(path, blob, { contentType, upsert: false });
  if (upErr) throw new Error(`asset upload failed: ${upErr.message}`);
  const { data, error: signErr } = await supabase.storage
    .from("user-videos")
    .createSignedUrl(path, 60 * 60); // 1h
  if (signErr || !data?.signedUrl) {
    throw new Error(`sign url failed: ${signErr?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

async function externalizeScriptAssets(script: ReelScript, userId: string): Promise<ReelScript> {
  const swap = async (url: string): Promise<string> => {
    if (!url.startsWith("data:")) return url;
    const mimeMatch = url.match(/^data:([^;,]+)/);
    const mime = mimeMatch?.[1] ?? "application/octet-stream";
    const ext =
      mime === "image/webp"
        ? "webp"
        : mime === "image/png"
          ? "png"
          : mime === "image/jpeg"
            ? "jpg"
            : mime === "audio/mpeg"
              ? "mp3"
              : mime === "audio/mp3"
                ? "mp3"
                : mime === "audio/wav"
                  ? "wav"
                  : "bin";
    return uploadDataUrl(url, userId, ext, mime);
  };

  const newPairs = await Promise.all(
    script.pairs.map(async (p) => ({
      ...p,
      original: { ...p.original, imageUrl: await swap(p.original.imageUrl) },
      dupe: { ...p.dupe, imageUrl: await swap(p.dupe.imageUrl) },
    })),
  );
  const newSegments = await Promise.all(
    script.segments.map(async (s) => ({
      ...s,
      audioDataUrl: await swap(s.audioDataUrl),
    })),
  );
  return { pairs: newPairs, segments: newSegments };
}

export async function renderAndSaveReelViaLambda({
  script,
  pairs,
  saveRecord,
  onProgress,
}: RenderAndSaveLambdaArgs): Promise<RenderAndSaveResult> {
  const totalFrames = totalDurationInFrames(script);

  // 0. Externalize all data: URLs (images + audio) to signed Storage URLs
  //    so the Lambda inputProps payload stays well under the 256 KB cap.
  const userId = await getCurrentUserIdFromSession();
  if (!userId) throw new Error("Not signed in");
  onProgress?.({ stage: "audio", pct: 0.02 });
  const lambdaScript = await externalizeScriptAssets(script, userId);

  // 1. Kick off Lambda render.
  const { renderId, bucketName } = await startLambdaRender({
    data: { script: lambdaScript },
  });

  // 2. Poll progress every 2s.
  let outputFile: string | null = null;
  while (true) {
    const progress = await getLambdaRenderProgress({
      data: { renderId, bucketName },
    });
    onProgress?.({ stage: "frames", pct: progress.overallProgress });
    if (progress.fatalErrorEncountered || (progress.errors?.length ?? 0) > 0) {
      throw new Error(progress.errors?.join("; ") || "Lambda render failed");
    }
    if (progress.done && progress.outputFile) {
      outputFile = progress.outputFile;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 3. Fetch MP4 via download proxy → Blob.
  onProgress?.({ stage: "finalize", pct: 0.95 });
  const proxyUrl = `/api/download-video?url=${encodeURIComponent(outputFile)}&filename=reel.mp4`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to download rendered video (${res.status})`);
  }
  const blob = await res.blob();

  // 4. Upload to user-videos + saveRecord.
  let storagePath: string | null = null;
  let saved = false;
  try {
    const userId = await getCurrentUserIdFromSession();
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

  onProgress?.({ stage: "finalize", pct: 1 });
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
