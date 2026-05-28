# Video Social Generator (Dashboard v2)

Add a second, **fully independent** generator on `/dashboard`, alongside the existing still carousel. Each generator picks its own product pair and runs its own pipeline — generating a video never triggers image generation and vice versa, so a user can run only what they need.

## Layout

`/dashboard` shows two side-by-side panels:
1. **Still carousel** (existing, untouched).
2. **Video reel** (new) — its own "Generate new video" button, its own pair, its own preview + download.

## Video pipeline (self-contained)

1. **Pick pair** — call `pickRandomDupePair` (server fn, already exists) — same selection rules, separate call from the still generator.
2. **Write script** deterministically from product data (no LLM cost). 4 lines, one per scene:
   - Hook: "Paying ${origPrice} for {origBrand} {origName}?"
   - Scan: "Let Dupli scan it for you."
   - Results: "{matchPct}% match — for just ${dupePrice}. You save ${savings}."
   - CTA:  "Find your dupe. Download Dupli on the App Store."
3. **Voiceover** — server fn calls ElevenLabs `text-to-speech/{voiceId}/with-timestamps` (voice **Jessica** `cgSgspJ2msm6clMCkdW9`, model `eleven_turbo_v2_5`). Returns base64 MP3 + per-character alignment → derive exact `[t1, t2, t3, t4]` scene durations from word offsets. Target total ≈ 15s.
4. **Scan clip** — server fn calls fal.ai Seedance (image-to-video using the original product image URL, 5s, 9:16). Prompt: "first-person shot, hand holding iPhone over a drugstore beauty shelf, phone screen shows a pink Dupli scanning UI scanning {origBrand} {origName}, soft retail lighting, cinematic". Returns video URL.
5. **Hook / Results / CTA stills** — generated *inside the video generator only* via Nano Banana (same prompts as the still carousel, but lives in this generator's own flow so it doesn't depend on the carousel panel having been run). 9:16 framing.
6. **Compose in the browser** with `@ffmpeg/ffmpeg` (ffmpeg.wasm):
   - 1080×1920, 30fps, h264
   - Scene 1/3/4: still + Ken-Burns zoom for `t1/t3/t4`
   - Scene 2: scan MP4 trimmed to `t2`
   - Audio = ElevenLabs MP3 across the full timeline
   - Subtle 200ms crossfade between scenes
7. **Preview + download** — `<video>` element + "Download .mp4" + "Regenerate" buttons. No DB writes, no storage uploads.

## New files

- `src/lib/dashboard-video.functions.ts` — server fns:
  - `generateVoiceover({ script })` → `{ audioBase64, scenes: [{start,end,text}] }`
  - `generateScanClip({ origBrand, origName, origImageUrl })` → `{ videoUrl }`
  - `buildVideoScript(pair)` (pure helper)
- `src/components/dashboard/video-generator.tsx` — standalone panel: pick pair → generate stills + VO + scan clip in parallel → compose → preview.
- `src/lib/ffmpeg-compose.ts` — lazy-loads ffmpeg.wasm client-side, returns final MP4 Blob.

## Edits

- `src/routes/dashboard.tsx` — add the `<VideoGenerator />` panel beside the existing carousel panel. No shared state between them.

## Dependencies

- `bun add @ffmpeg/ffmpeg @ffmpeg/util` (browser-only video composition; no Worker filesystem or native binaries).

## Secrets

After approval I'll request via `add_secret`:
- `ELEVENLABS_API_KEY`
- `FAL_KEY` (fal.ai Seedance)

## Out of scope

- Background music (VO only).
- Burned-in captions (alignment data is fetched, can be added later).
- Server-side ffmpeg / Workers rendering.
- History / storage of generated videos.
- Sharing state, pair, or assets between the still carousel and the video panel.

## Open question

OK to use **fal.ai Seedance** for the scan clip? If you'd rather use Runway or Replicate Kling, tell me before I request the API key.
