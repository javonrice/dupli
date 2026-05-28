## Diagnosis

The single generator works and the batch one fails because of three differences:

1. **Image proxying** — Batch routes every product image through `fetchImageAsDataUrl` → data URL before render. The single generator uses raw URLs. Several retailer URLs return non-decodable bytes (wrong content-type, HTML error page, anti-bot challenge), and html-to-image then throws `EncodingError: The source image cannot be decoded` on the resulting data URL. Single avoids this entirely.
2. **No visible preview Player** — Single mounts a visible `<Player autoPlay loop>` above the export button. By the time the user clicks Download, every `<Img>` is already loaded and decoded in the same DOM. Batch only mounts the hidden offscreen Player, so the very first frame seek races image decode.
3. **Shared hidden Player across reels** — Batch reuses one hidden mount and just swaps `activeScript`. Between reels the Remotion sequence/audio plumbing can still hold the previous AudioContext or image cache, which is what produced the earlier "closed AudioContext" symptom and contributes to flakier image readiness.

## Plan

1. **Drop the proxy step in batch** — Remove `inlinePairImages` / `fetchImageAsDataUrl` usage from `batch-generator.tsx` and pass raw `DupePair` URLs straight into `renderAndSaveReel`, matching the single generator.
2. **Stronger image pre-warm in `render-reel.ts`** — Before frame capture, walk the full `totalFrames` range (not just segment starts) at coarse intervals (e.g. every 6 frames) so every image referenced anywhere in the timeline mounts and decodes. Keep the existing `waitForImages()` per segment start.
3. **Force-decode images** — In `waitForImages`, after `load` fires, call `img.decode().catch(() => {})` so the browser actually decodes the bitmap before html-to-image reads it. This is the specific fix for `EncodingError: source image cannot be decoded`.
4. **Fresh hidden Player per reel in batch** — Key the hidden capture stage by `item.id` so each reel mounts a brand-new `<Player>` and unmounts the previous one, eliminating cross-reel state bleed.
5. **Keep current debug output** — The frame-failure panel stays as-is; after the fix most entries should disappear.

## Technical notes

- `img.decode()` returns a promise that resolves only when the bitmap is ready for canvas use; `complete && naturalWidth > 0` is necessary but not sufficient.
- The proxy can stay in the codebase for other callers (share card) — we just stop using it in the batch path.
- No backend changes.