// Browser-only ffmpeg.wasm composer. Never import from server code.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

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

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export type ComposeInput = {
  hookPngBase64: string;
  scanMp4Base64: string;
  resultsPngBase64: string;
  ctaPngBase64: string;
  voiceMp3Base64: string;
  sceneDurations: [number, number, number, number]; // sec
  onLog?: (line: string) => void;
  onProgress?: (ratio: number) => void;
};

export async function composeReel(input: ComposeInput): Promise<Blob> {
  const ff = await getFFmpeg(input.onLog);
  if (input.onProgress) {
    ff.on("progress", ({ progress }) => input.onProgress?.(progress));
  }

  const [d1, d2, d3, d4] = input.sceneDurations.map((d) =>
    Math.max(0.5, Number(d.toFixed(2))),
  );

  await ff.writeFile("s1.png", base64ToBytes(input.hookPngBase64));
  await ff.writeFile("scan.mp4", base64ToBytes(input.scanMp4Base64));
  await ff.writeFile("s3.png", base64ToBytes(input.resultsPngBase64));
  await ff.writeFile("s4.png", base64ToBytes(input.ctaPngBase64));
  await ff.writeFile("voice.mp3", base64ToBytes(input.voiceMp3Base64));

  const filter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${d1},setpts=PTS-STARTPTS[v0]`,
    `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${d2},setpts=PTS-STARTPTS[v1]`,
    `[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${d3},setpts=PTS-STARTPTS[v2]`,
    `[3:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${d4},setpts=PTS-STARTPTS[v3]`,
    `[v0][v1][v2][v3]concat=n=4:v=1:a=0[outv]`,
  ].join(";");

  const args = [
    "-loop", "1", "-t", String(d1), "-i", "s1.png",
    "-i", "scan.mp4",
    "-loop", "1", "-t", String(d3), "-i", "s3.png",
    "-loop", "1", "-t", String(d4), "-i", "s4.png",
    "-i", "voice.mp3",
    "-filter_complex", filter,
    "-map", "[outv]",
    "-map", "4:a",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-shortest",
    "-movflags", "+faststart",
    "out.mp4",
  ];

  await ff.exec(args);
  const data = (await ff.readFile("out.mp4")) as Uint8Array;

  // Clean up
  for (const f of ["s1.png", "scan.mp4", "s3.png", "s4.png", "voice.mp3", "out.mp4"]) {
    try { await ff.deleteFile(f); } catch { /* noop */ }
  }

  return new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
}
