// Browser-only renderer: captures a hidden full-res Remotion <Player> frame by
// frame via html-to-image, mixes the 4 voiceover MP3s offline, and muxes
// everything into a real MP4 using ffmpeg.wasm. Zero external services.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { toCanvas } from "html-to-image";
import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";
import type { ReelScript } from "./dupe-types";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    const baseURL = "https://unpkg.com/@ffmpeg/[email protected]/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();
  return loadPromise;
}

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

export type RenderProgress = {
  stage: "audio" | "frames" | "encode";
  pct: number;
};

export type FrameFailureCause =
  | "image-decode"
  | "network"
  | "font"
  | "audio-decode"
  | "unknown";

export type FrameFailure = {
  frame: number;
  segmentKey: string;
  cause: FrameFailureCause;
  message: string;
  attempts: number;
  url?: string;
};

export type RenderDebug = {
  failures: FrameFailure[];
  brokenImages: { src: string; reason: string }[];
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
  onDebug?: (entry: FrameFailure | { type: "image"; src: string; reason: string }) => void;
};

function classifyError(err: unknown): { cause: FrameFailureCause; message: string; url?: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  const urlMatch = msg.match(/https?:\/\/[^\s"')]+/);
  const url = urlMatch?.[0];

  if (name === "EncodingError" || /decode/i.test(msg) || /source image/i.test(msg)) {
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


export async function renderReelToMp4(opts: RenderOpts): Promise<Blob> {
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
  const totalSec = totalFrames / fps;

  // Frame index → segment key map for nicer debug output.
  const segmentKeys = script.segments.map((s) => s.key);
  const segmentKeyFor = (frame: number): string => {
    let key = segmentKeys[0] ?? "?";
    for (let i = 0; i < segmentStartFrames.length; i++) {
      if (frame >= segmentStartFrames[i]) key = segmentKeys[i] ?? key;
    }
    return key;
  };

  onProgress?.({ stage: "audio", pct: 0 });
  const decodeCtx = new AudioContext();
  const decoded: AudioBuffer[] = [];
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
      const failure: FrameFailure = {
        frame: segmentStartFrames[i] ?? 0,
        segmentKey: seg.key,
        cause: "audio-decode",
        message: info.message,
        attempts: 1,
      };
      onDebug?.(failure);
      console.warn("[render-reel] audio decode failed", failure);
      throw err;
    }
  }
  await decodeCtx.close();

  await decodeCtx.close();

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
  const mixed = await offline.startRendering();
  const wavBytes = encodeWav(mixed);
  onProgress?.({ stage: "audio", pct: 1 });

  // 2. Capture frames -------------------------------------------------------
  const ff = await getFFmpeg();
  await ff.writeFile("audio.wav", wavBytes);

  const player = playerRef.current;
  if (!player) throw new Error("Hidden player not mounted");
  player.pause();

  // Pre-warm: scrub through every segment so each <Img> mounts + loads at
  // least once before we start capturing frames. Otherwise html-to-image
  // hits images that haven't decoded yet and throws "source image cannot
  // be decoded" / "Failed to fetch".
  async function waitForImages() {
    const imgs = Array.from(captureEl.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = (kind: "load" | "error" | "timeout") => {
            if (kind !== "load") {
              const src = (img.getAttribute("src") ?? "").slice(0, 200);
              const reason =
                kind === "error" ? "img error event" : "load timeout (1500ms)";
              onDebug?.({ type: "image", src, reason });
              console.warn("[render-reel] image broken", { src, reason });
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
  for (const sf of segmentStartFrames) {
    player.seekTo(sf);
    await nextFrame();
    await waitForImages();
  }
  player.seekTo(0);
  await nextFrame();
  await waitForImages();
  await new Promise((r) => setTimeout(r, 250));



  const captureOpts = {
    canvasWidth: width,
    canvasHeight: height,
    pixelRatio: 1,
    cacheBust: false,
    skipFonts: true,
    skipAutoScale: true,
    fetchRequestInit: { cache: "force-cache" as RequestCache },
    imagePlaceholder:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  for (let f = 0; f < totalFrames; f++) {
    player.seekTo(f);
    await nextFrame();
    let canvas: HTMLCanvasElement | null = null;
    let lastErr: unknown = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts = attempt + 1;
      try {
        canvas = await toCanvas(captureEl, captureOpts);
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    if (!canvas) {
      const info = classifyError(lastErr);
      const failure: FrameFailure = {
        frame: f,
        segmentKey: segmentKeyFor(f),
        cause: info.cause,
        message: info.message,
        attempts,
        url: info.url,
      };
      onDebug?.(failure);
      console.warn("[render-reel] frame capture failed", failure);
      // Last-ditch blank frame to keep the timeline aligned.
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
    }

    }
    const blob: Blob = await new Promise((res, rej) =>
      canvas!.toBlob(
        (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
        "image/jpeg",
        0.85,
      ),
    );

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = `f${String(f).padStart(5, "0")}.jpg`;
    await ff.writeFile(name, bytes);
    if (f % 3 === 0 || f === totalFrames - 1) {
      onProgress?.({ stage: "frames", pct: (f + 1) / totalFrames });
    }
  }

  // 3. Encode MP4 -----------------------------------------------------------
  onProgress?.({ stage: "encode", pct: 0 });
  const progressHandler = ({ progress }: { progress: number }) =>
    onProgress?.({ stage: "encode", pct: Math.min(1, Math.max(0, progress)) });
  ff.on("progress", progressHandler);
  try {
    await ff.exec([
      "-framerate",
      String(fps),
      "-i",
      "f%05d.jpg",
      "-i",
      "audio.wav",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
  } finally {
    ff.off("progress", progressHandler);
  }
  const data = (await ff.readFile("out.mp4")) as Uint8Array;

  // 4. Cleanup --------------------------------------------------------------
  for (let f = 0; f < totalFrames; f++) {
    try {
      await ff.deleteFile(`f${String(f).padStart(5, "0")}.jpg`);
    } catch {
      /* noop */
    }
  }
  try {
    await ff.deleteFile("audio.wav");
  } catch {
    /* noop */
  }
  try {
    await ff.deleteFile("out.mp4");
  } catch {
    /* noop */
  }

  return new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
}
