## Goal

Make the Dupe Reel download dramatically faster and visibly higher quality, while staying browser-only (no extra services, no API keys).

## Where the current pipeline burns time + quality

```
~15s reel @ 1080×1920 / 30fps = 450 frames

1. html-to-image.toCanvas       ~200–500ms/frame  →  1.5–4 min
2. canvas.toBlob(jpeg, 0.85)    ~20–40ms/frame    →  ~15s
3. ffmpeg.wasm libx264 ultrafast  ~30–90s total
4. Single-thread, fully sequential (seek → capture → write → next)
```

Bottlenecks: DOM serialization on every frame, lossy JPEG intermediates, and a wasm encoder running on one CPU thread. Quality cap is set by `quality: 0.85` JPEGs and `ultrafast` x264.

## Plan

### 1. Replace `html-to-image` with `modern-screenshot`
Drop-in API, 3–5× faster on the same DOM. Same `toCanvas(el, opts)` signature, much better foreignObject + image caching. No visual change.

### 2. Replace ffmpeg.wasm with WebCodecs `VideoEncoder` + `mp4-muxer`
- `VideoEncoder` uses the GPU/hardware h264 encoder in Chrome/Edge/Safari 16.4+. Encodes 1080×1920@30 in real time or faster.
- Encode straight from the canvas via `new VideoFrame(canvas, { timestamp })` — no JPEG round-trip, no disk write, no wasm.
- Mux the encoded chunks + AAC audio with `mp4-muxer` (tiny, pure JS).
- Audio path: keep current offline mix → encode with `AudioEncoder` (AAC) instead of writing WAV into ffmpeg.
- Result: encode step goes from ~60s to a few seconds; quality goes up because we feed lossless frames at high bitrate (target 10 Mbps for 1080×1920@30).

### 3. Fallback path for browsers without WebCodecs
Detect `window.VideoEncoder`. If missing (older Safari), keep the existing ffmpeg.wasm path as a fallback so nothing breaks.

### 4. Pipeline overlap (cuts wall-clock ~30%)
Currently: seek → wait → capture → encode (serial). Change to:
- Seek to frame `f+1` and `await nextFrame()` while frame `f`'s `VideoFrame` is queued to the encoder.
- `VideoEncoder.encode()` is non-blocking; we just need to await its internal back-pressure (`encoder.encodeQueueSize`).

### 5. Quality knobs (exposed but not user-facing)
- Frame source: capture canvas at `pixelRatio: 1` (already true) since composition is already 1080×1920.
- Bitrate: 10 Mbps default, 6 Mbps low-bandwidth fallback.
- Keyframe interval: every 2s (60 frames).
- Color: `bt709`, full range, `yuv420p` (Instagram/TikTok safe).

### 6. Progress + error UX (no scope change)
Reuse existing `onProgress({ stage, pct })`. Stages become `audio → frames → encode → finalize`. Encode pct comes from `framesEncoded / totalFrames`. Frame-failure debug panel stays.

### 7. Cleanup
- Remove `ffmpeg-compose.ts` if nothing else imports it (it's the old carousel composer). Confirm before deleting.
- Keep `@ffmpeg/*` deps for the fallback path.
- Add `mp4-muxer` and `modern-screenshot` to deps.

## Technical notes (skip if non-technical)

- `VideoEncoder` config: `{ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 10_000_000, framerate: 30, hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' } }`.
- `mp4-muxer`: `new Muxer({ target: new ArrayBufferTarget(), video: {...}, audio: {...}, fastStart: 'in-memory' })` → produces a faststart MP4 in memory (no temp files).
- `AudioEncoder` AAC: `{ codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 }`. Feed the offline-mixed `AudioBuffer` as `AudioData` chunks of ~1024 samples.
- Canvas capture: pass `new VideoFrame(canvas, { timestamp: f * 1_000_000 / fps, duration: 1_000_000 / fps })`. Close each `VideoFrame` after `encode()` to free GPU memory.
- Keep `cacheBust: false`, `force-cache` fetch, and the existing image pre-warm — those still matter regardless of encoder.

## Expected outcome

For a 15s, 4-pair reel on a modern laptop:
- Today: ~3–5 minutes wall clock, JPEG-quality frames, 2–4 Mbps effective.
- After: ~30–60 seconds wall clock, lossless-source frames, 10 Mbps h264.

## Out of scope (mention only if you want it later)

- Server-side rendering (Remotion Lambda or hosted render API). Would be even faster and frees the user's tab, but adds cost and an external dependency. Happy to wire this up as a follow-up if browser perf still isn't enough.