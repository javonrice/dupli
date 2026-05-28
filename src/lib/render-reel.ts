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
};

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
  } = opts;
  const sampleRate = 44100;
  const totalSec = totalFrames / fps;

  // 1. Decode + mix audio offline ------------------------------------------
  onProgress?.({ stage: "audio", pct: 0 });
  const decodeCtx = new AudioContext();
  const decoded: AudioBuffer[] = [];
  for (const seg of script.segments) {
    const bytes = dataUrlToBytes(seg.audioDataUrl);
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    decoded.push(await decodeCtx.decodeAudioData(ab));
  }
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
  player.seekTo(0);
  await nextFrame();
  // Give images one extra beat to decode on first paint.
  await new Promise((r) => setTimeout(r, 250));

  for (let f = 0; f < totalFrames; f++) {
    player.seekTo(f);
    await nextFrame();
    const canvas = await toCanvas(captureEl, {
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      cacheBust: false,
      skipFonts: true,
      skipAutoScale: true,
      fetchRequestInit: { cache: "force-cache" },
      imagePlaceholder:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    });
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(
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
