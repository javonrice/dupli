// Browser-only renderer. Primary path: WebCodecs (hardware-accelerated h264)
// + mp4-muxer + modern-screenshot. Fallback: html-to-image + ffmpeg.wasm for
// browsers without VideoEncoder (older Safari).
//
// WebCodecs path renders a 15s 1080×1920 reel in ~30-60s on modern laptops.
// ffmpeg.wasm fallback runs the same reel in ~3-5 minutes.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { toCanvas as htmlToImageToCanvas } from "html-to-image";
import { domToCanvas } from "modern-screenshot";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";
import type { ReelScript } from "./dupe-types";

// ---------- shared types -----------------------------------------------------

export type RenderProgress = {
  stage: "audio" | "frames" | "encode" | "finalize";
  pct: number;
};

export type FrameFailureCause =
  | "image-decode"
  | "network"
  | "font"
  | "audio-decode"
  | "encoder"
  | "unknown";

export type FrameFailure = {
  frame: number;
  segmentKey: string;
  cause: FrameFailureCause;
  message: string;
  attempts: number;
  url?: string;
};

export type RenderOpts = {
  playerRef: RefObject<PlayerRef | null>;
  captureEl: HTMLElement;
  script: ReelScript;
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  segmentStartFrames: number[];
  onProgress?: (p: RenderProgress) => void;
  onDebug?: (
    entry: FrameFailure | { type: "image"; src: string; reason: string },
  ) => void;
};

// ---------- ffmpeg.wasm lazy load (fallback only) ---------------------------

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({ coreURL, wasmURL });
    ffmpegInstance = ff;
    return ff;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

// ---------- helpers ----------------------------------------------------------

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeWav(audio: AudioBuffer): Uint8Array {
  const numCh = audio.numberOfChannels;
  const sr = audio.sampleRate;
  const dataLen = audio.length * numCh * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(audio.getChannelData(c));
  let off = 44;
  for (let i = 0; i < audio.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}

function nextFrame(): Promise<void> {
  return new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}

function classifyError(err: unknown): {
  cause: FrameFailureCause;
  message: string;
  url?: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  const urlMatch = msg.match(/https?:\/\/[^\s"')]+/);
  const url = urlMatch?.[0];
  if (
    name === "EncodingError" ||
    /decode/i.test(msg) ||
    /source image/i.test(msg)
  ) {
    return { cause: "image-decode", message: msg, url };
  }
  if (/font|woff|otf|ttf|@font-face/i.test(msg)) {
    return { cause: "font", message: msg, url };
  }
  if (
    /failed to fetch|networkerror|load failed|err_/i.test(msg) ||
    name === "TypeError"
  ) {
    return { cause: "network", message: msg, url };
  }
  return { cause: "unknown", message: msg, url };
}

// ---------- audio mix (shared by both paths) --------------------------------

async function mixAudio(
  script: ReelScript,
  segmentStartFrames: number[],
  fps: number,
  totalFrames: number,
  sampleRate: number,
  onDebug?: RenderOpts["onDebug"],
): Promise<AudioBuffer> {
  const totalSec = totalFrames / fps;
  const decodeCtx = new AudioContext();
  const decoded: AudioBuffer[] = [];
  try {
    for (let i = 0; i < script.segments.length; i++) {
      const seg = script.segments[i];
      const bytes = dataUrlToBytes(seg.audioDataUrl);
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      try {
        decoded.push(await decodeCtx.decodeAudioData(ab));
      } catch (err) {
        const info = classifyError(err);
        onDebug?.({
          frame: segmentStartFrames[i] ?? 0,
          segmentKey: seg.key,
          cause: "audio-decode",
          message: info.message,
          attempts: 1,
        });
        throw err;
      }
    }
  } finally {
    if (decodeCtx.state !== "closed") {
      try {
        await decodeCtx.close();
      } catch {
        /* noop */
      }
    }
  }
  const offline = new OfflineAudioContext(
    2,
    Math.ceil(sampleRate * totalSec),
    sampleRate,
  );
  decoded.forEach((buffer, i) => {
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(segmentStartFrames[i] / fps);
  });
  return offline.startRendering();
}

// ---------- image pre-warm (shared) -----------------------------------------

async function preWarmImages(
  player: PlayerRef,
  captureEl: HTMLElement,
  totalFrames: number,
  segmentStartFrames: number[],
  onDebug?: RenderOpts["onDebug"],
) {
  async function waitForImages() {
    const imgs = Array.from(captureEl.querySelectorAll("img"));
    await Promise.all(
      imgs.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) {
          await img.decode().catch(() => undefined);
          return;
        }
        return new Promise<void>((resolve) => {
          const done = async (kind: "load" | "error" | "timeout") => {
            if (kind === "load") await img.decode().catch(() => undefined);
            if (kind !== "load") {
              const src = (img.getAttribute("src") ?? "").slice(0, 200);
              onDebug?.({
                type: "image",
                src,
                reason:
                  kind === "error" ? "img error event" : "load timeout (1500ms)",
              });
            }
            resolve();
          };
          img.addEventListener("load", () => done("load"), { once: true });
          img.addEventListener("error", () => done("error"), { once: true });
          setTimeout(() => done("timeout"), 1500);
        });
      }),
    );
  }
  for (let f = 0; f < totalFrames; f += 6) {
    player.seekTo(f);
    await nextFrame();
    await waitForImages();
  }
  for (const sf of segmentStartFrames) {
    player.seekTo(sf);
    await nextFrame();
    await waitForImages();
  }
  player.seekTo(0);
  await nextFrame();
  await waitForImages();
  return waitForImages;
}

// ---------- WebCodecs support detection -------------------------------------

async function supportsWebCodecs(width: number, height: number): Promise<{
  ok: boolean;
  videoCodec?: string;
}> {
  if (
    typeof window === "undefined" ||
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder ===
      "undefined" ||
    typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder ===
      "undefined" ||
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame ===
      "undefined"
  ) {
    return { ok: false };
  }
  // Try High profile L4.0 first (better quality at same bitrate), then Main L4.0.
  const candidates = ["avc1.640028", "avc1.4D0028", "avc1.42E028"];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 10_000_000,
        framerate: 30,
        hardwareAcceleration: "prefer-software",
      });
      if (support.supported) return { ok: true, videoCodec: codec };
    } catch {
      /* try next */
    }
  }
  return { ok: false };
}

// ---------- WebCodecs path (primary) ----------------------------------------

async function renderWithWebCodecs(
  opts: RenderOpts,
  videoCodec: string,
): Promise<Blob> {
  const {
    playerRef,
    captureEl,
    script,
    totalFrames,
    fps,
    width,
    height,
    segmentStartFrames,
    onProgress,
    onDebug,
  } = opts;
  const sampleRate = 44100;
  const segmentKeys = script.segments.map((s) => s.key);
  const segmentKeyFor = (frame: number): string => {
    let key = segmentKeys[0] ?? "?";
    for (let i = 0; i < segmentStartFrames.length; i++) {
      if (frame >= segmentStartFrames[i]) key = segmentKeys[i] ?? key;
    }
    return key;
  };

  // 1. Audio mix ------------------------------------------------------------
  onProgress?.({ stage: "audio", pct: 0 });
  const mixed = await mixAudio(
    script,
    segmentStartFrames,
    fps,
    totalFrames,
    sampleRate,
    onDebug,
  );
  onProgress?.({ stage: "audio", pct: 1 });

  // 2. Set up muxer + encoders ---------------------------------------------
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: "in-memory",
    video: { codec: "avc", width, height, frameRate: fps },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate },
    firstTimestampBehavior: "offset",
  });

  let videoError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      videoError = e;
      console.error("[render-reel] video encoder error", e);
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: 10_000_000,
    framerate: fps,
    hardwareAcceleration: "prefer-hardware",
    avc: { format: "avc" },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("[render-reel] audio encoder error", e),
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: 2,
    bitrate: 128_000,
  });

  // 3. Encode audio (fast, parallel with frame capture) --------------------
  const audioPromise = (async () => {
    const chunkSize = 1024;
    const numCh = mixed.numberOfChannels;
    const chans: Float32Array[] = [];
    for (let c = 0; c < numCh; c++) chans.push(mixed.getChannelData(c));
    const total = mixed.length;
    for (let off = 0; off < total; off += chunkSize) {
      const frames = Math.min(chunkSize, total - off);
      // Planar f32: concat channel data.
      const planar = new Float32Array(frames * numCh);
      for (let c = 0; c < numCh; c++) {
        planar.set(chans[c].subarray(off, off + frames), c * frames);
      }
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: numCh,
        timestamp: Math.round((off / sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
  })();

  // 4. Pre-warm + capture frames -------------------------------------------
  const player = playerRef.current;
  if (!player) throw new Error("Hidden player not mounted");
  player.pause();
  const waitForImages = await preWarmImages(
    player,
    captureEl,
    totalFrames,
    segmentStartFrames,
    onDebug,
  );
  await new Promise((r) => setTimeout(r, 150));
  onProgress?.({ stage: "frames", pct: 0 });

  const captureOpts = {
    scale: 1,
    backgroundColor: undefined,
    font: false as const,
    fetch: { requestInit: { cache: "force-cache" as RequestCache } },
  };
  const keyframeInterval = fps * 2; // 2s
  const frameDuration = Math.round(1_000_000 / fps);

  for (let f = 0; f < totalFrames; f++) {
    if (videoError) throw videoError;
    player.seekTo(f);
    await nextFrame();
    // Quick re-check on first seek into a new segment (cheap if cached).
    if (segmentStartFrames.includes(f)) await waitForImages();

    let canvas: HTMLCanvasElement | null = null;
    let lastErr: unknown = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts = attempt + 1;
      try {
        canvas = await domToCanvas(captureEl, captureOpts);
        break;
      } catch (err) {
        lastErr = err;
        // modern-screenshot occasionally fails on transient decode; retry.
        await new Promise((r) => setTimeout(r, 80));
        // Last-ditch: try html-to-image, which has different cloning.
        if (attempt === 2) {
          try {
            canvas = await htmlToImageToCanvas(captureEl, {
              canvasWidth: width,
              canvasHeight: height,
              pixelRatio: 1,
              cacheBust: false,
              skipFonts: true,
              skipAutoScale: true,
              fetchRequestInit: { cache: "force-cache" },
            });
            break;
          } catch (err2) {
            lastErr = err2;
          }
        }
      }
    }
    if (!canvas) {
      const info = classifyError(lastErr);
      onDebug?.({
        frame: f,
        segmentKey: segmentKeyFor(f),
        cause: info.cause,
        message: info.message,
        attempts,
        url: info.url,
      });
      // Last-ditch blank frame to keep audio sync.
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Back-pressure: don't let the encoder queue grow without bound.
    while (videoEncoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 4));
      if (videoError) throw videoError;
    }

    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round((f / fps) * 1_000_000),
      duration: frameDuration,
    });
    videoEncoder.encode(videoFrame, {
      keyFrame: f % keyframeInterval === 0,
    });
    videoFrame.close();

    if (f % 3 === 0 || f === totalFrames - 1) {
      onProgress?.({ stage: "frames", pct: (f + 1) / totalFrames });
    }
  }

  // 5. Flush + finalize -----------------------------------------------------
  onProgress?.({ stage: "encode", pct: 0.5 });
  await audioPromise;
  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
  videoEncoder.close();
  audioEncoder.close();
  onProgress?.({ stage: "finalize", pct: 0.9 });
  muxer.finalize();
  const { buffer } = muxer.target;
  onProgress?.({ stage: "finalize", pct: 1 });
  return new Blob([buffer], { type: "video/mp4" });
}

// ---------- ffmpeg.wasm fallback path ---------------------------------------

async function renderWithFFmpeg(opts: RenderOpts): Promise<Blob> {
  const {
    playerRef,
    captureEl,
    script,
    totalFrames,
    fps,
    width,
    height,
    segmentStartFrames,
    onProgress,
    onDebug,
  } = opts;
  const sampleRate = 44100;
  const segmentKeys = script.segments.map((s) => s.key);
  const segmentKeyFor = (frame: number): string => {
    let key = segmentKeys[0] ?? "?";
    for (let i = 0; i < segmentStartFrames.length; i++) {
      if (frame >= segmentStartFrames[i]) key = segmentKeys[i] ?? key;
    }
    return key;
  };

  onProgress?.({ stage: "audio", pct: 0 });
  const mixed = await mixAudio(
    script,
    segmentStartFrames,
    fps,
    totalFrames,
    sampleRate,
    onDebug,
  );
  const wavBytes = encodeWav(mixed);
  onProgress?.({ stage: "audio", pct: 1 });

  const ff = await getFFmpeg();
  await ff.writeFile("audio.wav", wavBytes);

  const player = playerRef.current;
  if (!player) throw new Error("Hidden player not mounted");
  player.pause();
  const waitForImages = await preWarmImages(
    player,
    captureEl,
    totalFrames,
    segmentStartFrames,
    onDebug,
  );
  await new Promise((r) => setTimeout(r, 150));

  const captureOpts = {
    canvasWidth: width,
    canvasHeight: height,
    pixelRatio: 1,
    cacheBust: false,
    skipFonts: true,
    skipAutoScale: true,
    fetchRequestInit: { cache: "force-cache" as RequestCache },
  };
  for (let f = 0; f < totalFrames; f++) {
    player.seekTo(f);
    await nextFrame();
    if (segmentStartFrames.includes(f)) await waitForImages();
    let canvas: HTMLCanvasElement | null = null;
    let lastErr: unknown = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts = attempt + 1;
      try {
        canvas = await htmlToImageToCanvas(captureEl, captureOpts);
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    if (!canvas) {
      const info = classifyError(lastErr);
      onDebug?.({
        frame: f,
        segmentKey: segmentKeyFor(f),
        cause: info.cause,
        message: info.message,
        attempts,
        url: info.url,
      });
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
    }
    const blob: Blob = await new Promise((res, rej) =>
      canvas!.toBlob(
        (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
        "image/jpeg",
        0.9,
      ),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await ff.writeFile(`f${String(f).padStart(5, "0")}.jpg`, bytes);
    if (f % 3 === 0 || f === totalFrames - 1) {
      onProgress?.({ stage: "frames", pct: (f + 1) / totalFrames });
    }
  }

  onProgress?.({ stage: "encode", pct: 0 });
  const progressHandler = ({ progress }: { progress: number }) =>
    onProgress?.({ stage: "encode", pct: Math.min(1, Math.max(0, progress)) });
  ff.on("progress", progressHandler);
  try {
    await ff.exec([
      "-framerate", String(fps),
      "-i", "f%05d.jpg",
      "-i", "audio.wav",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      "out.mp4",
    ]);
  } finally {
    ff.off("progress", progressHandler);
  }
  const data = (await ff.readFile("out.mp4")) as Uint8Array;
  for (let f = 0; f < totalFrames; f++) {
    try { await ff.deleteFile(`f${String(f).padStart(5, "0")}.jpg`); } catch { /* noop */ }
  }
  try { await ff.deleteFile("audio.wav"); } catch { /* noop */ }
  try { await ff.deleteFile("out.mp4"); } catch { /* noop */ }
  return new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
}

// ---------- public entry -----------------------------------------------------

export async function renderReelToMp4(opts: RenderOpts): Promise<Blob> {
  const support = await supportsWebCodecs(opts.width, opts.height);
  if (support.ok && support.videoCodec) {
    try {
      return await renderWithWebCodecs(opts, support.videoCodec);
    } catch (err) {
      console.warn(
        "[render-reel] WebCodecs path failed, falling back to ffmpeg.wasm",
        err,
      );
    }
  }
  return renderWithFFmpeg(opts);
}
