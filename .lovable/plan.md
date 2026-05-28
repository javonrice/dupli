# Standalone Video Generator on /dashboard

A second, fully independent generator panel beside the existing still carousel. No shared state, no DB writes, no storage — just generate → preview → download.

## Layout

`/dashboard` becomes a two-panel grid:
- **Left:** existing still carousel (untouched)
- **Right:** new "Video Reel" panel with its own random pair pick, generate button, `<video>` preview, Download .mp4, Regenerate

## Pipeline (per click)

1. **Pick pair** — `pickRandomDupePair` server fn (separate call from the carousel's)
2. **Build 4-line script** deterministically from pair data — no LLM cost
   - Hook: "POV: you almost paid $X for {original}"
   - Scan: "But the scanner found this..."
   - Results: "{dupe} — {match}% match for $Y"
   - CTA: "Scan anything. Save everything. Dupli."
3. **Voiceover** — ElevenLabs `text-to-speech/{Jessica}/with-timestamps`, `eleven_turbo_v2_5`, returns base64 MP3 + per-character alignment. Derive scene boundaries `[t1,t2,t3,t4]` from alignment (≈12–16s total).
4. **Scan clip** — fal.ai Seedance image-to-video (5s, 9:16) from the original product image URL, prompt describing a phone-style scan sweep
5. **Hook / Results / CTA stills** — generated *inside this panel only* via Lovable AI Nano Banana (`google/gemini-2.5-flash-image`), same product-aware composition style as carousel
6. **Compose in browser** with `@ffmpeg/ffmpeg` (ffmpeg.wasm), lazy-loaded:
   - 1080×1920, 30fps, h264 + AAC
   - Stills get Ken-Burns zoom for their derived duration
   - Scan MP4 trimmed/sped to fit scene 2 duration
   - Voiceover MP3 as single audio track
   - 200ms crossfades between scenes
7. **Preview + Download + Regenerate** — blob URL into `<video>`, download link to `dupli-reel-{ts}.mp4`

## Files

**New**
- `src/lib/dashboard-video.functions.ts` — server fns:
  - `generateVoiceover({ script })` → `{ audioBase64, alignment, sceneDurations }`
  - `generateScanClip({ imageUrl, prompt })` → `{ videoUrl }` (fal.ai Seedance queue + poll)
  - `generateVideoStill({ prompt, refImageUrl })` → `{ imageBase64 }` (Lovable AI Nano Banana)
- `src/components/dashboard/video-generator.tsx` — standalone panel UI + orchestration
- `src/lib/ffmpeg-compose.ts` — client-only ffmpeg.wasm loader + compose function

**Edited**
- `src/routes/dashboard.tsx` — add right-side `<VideoGenerator />` panel
- `package.json` — add `@ffmpeg/ffmpeg`, `@ffmpeg/util`

**Untouched:** existing still carousel, `dashboard.functions.ts`, all auth/routing.

## Cost controls

- Video panel does **nothing** until user clicks Generate
- Carousel and video panel are fully independent — generating one never triggers the other
- Each click costs roughly: 1 ElevenLabs TTS (~15s), 1 fal.ai Seedance (5s 9:16), 3 Nano Banana images
- No retries on success, no autoplay-triggered regen

## Secrets

`ELEVENLABS_API_KEY` and `FAL_KEY` — both confirmed added.

## Out of scope

- Background music, burned-in captions, server-side ffmpeg
- History / saved videos / shared state with carousel
- Auth changes (still manual navigation to `/dashboard`)
