## Goal

Stop the WebCodecs hardware encoder from being reclaimed mid-render (the `QuotaExceededError: Codec reclaimed due to inactivity` you saw), and stop leaking `VideoFrame`s. Result: the fast path actually completes and we don't silently fall back to the slow ffmpeg.wasm path.

## Why it's happening

In `src/lib/render-reel.ts` → `renderWithWebCodecs`, the per-frame loop does:

1. `domToCanvas(captureEl)` — this can take 100–500ms per frame (DOM clone + image decode).
2. `videoEncoder.encode(frame)`.

Chrome's **hardware** H.264 encoder is reclaimed if it sits idle too long between `encode()` calls. The big gap is step 1, not the encoder itself. Once reclaimed, the next `encode()` throws `InvalidStateError: closed codec`, and we drop into the ffmpeg.wasm fallback — which works but is much slower (what you're feeling as "still slow").

The `VideoFrame was garbage collected` warning is the same incident: when `encode()` throws, the `videoFrame.close()` line is never reached for that frame.

## Fix (in `src/lib/render-reel.ts`)

Four small, surgical changes — no architectural rewrite:

1. **Prefer software encoder.** Change `hardwareAcceleration: "prefer-hardware"` to `"prefer-software"` in `videoEncoder.configure(...)`. Software encoders aren't reclaimed for inactivity. On a 540×960 reel at 30fps with 10Mbps bitrate, software H.264 is plenty fast — the bottleneck is `domToCanvas`, not the encoder. Update `supportsWebCodecs` to probe with the same flag so we don't pick a codec the software encoder can't do.

2. **Guarantee `frame.close()`.** Wrap the frame in `try { encode } finally { close }` so a thrown `encode()` still releases GPU memory. Kills the "VideoFrame was garbage collected" warning.

3. **Recover from a reclaimed encoder instead of bailing.** If `encode()` throws `InvalidStateError` (or the `error` callback fires with `QuotaExceededError`), reconfigure the encoder once and re-emit the current frame as a keyframe, rather than throwing out of the whole WebCodecs path. Only fall through to ffmpeg.wasm if reconfigure also fails.

4. **Keep the pipeline tighter while capture runs.** Drop the `await new Promise(r => setTimeout(r, 150))` warmup before the loop and the `setTimeout(r, 80)` retry sleeps down to a microtask (`await Promise.resolve()`) — these add cumulative idle time. Keep the existing `encodeQueueSize > 4` back-pressure check.

## Out of scope (not changing now)

- The `postMessage` origin warning — that's Lovable's preview shell, not our app.
- The image-proxy round-trip — that already happens once upfront in `ugc-generator.tsx` before render starts, so it's not contributing to per-frame gaps.
- Pre-rendering all canvases into memory before encoding — would help further but uses a lot of RAM for a 30s reel; revisit only if (1)–(4) aren't enough.

## How we'll verify

After the change, render a reel and confirm in the console:
- No `Codec reclaimed due to inactivity`.
- No `VideoFrame was garbage collected`.
- No `WebCodecs path failed, falling back to ffmpeg.wasm`.
- Render completes noticeably faster (fast path, not ffmpeg.wasm).