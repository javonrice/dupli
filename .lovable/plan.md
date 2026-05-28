# Remotion UGC reel with timed voiceover

## Goal
Kill HeyGen and ship a Remotion-driven 9:16 dupe-reveal video where every scene is timed to a real ElevenLabs voiceover track (no guesswork, no "best effort" timing).

## Runtime reality (important)
Remotion's CLI renderer needs Node + Chromium and cannot run in our Cloudflare Worker backend. So:
- **Source of truth**: Remotion composition (`@remotion/player`, `@remotion/transitions`) — real React scenes, frame-based animation.
- **Preview**: `<Player>` inline in the dashboard, instantly scrubbable.
- **Export to MP4**: in-browser capture of the `<Player>` canvas via `MediaRecorder` + the audio track, muxed to a single `.webm`/`.mp4` blob the user can download. No server render farm, no extra infra.

This is the standard "Remotion in the browser" pattern when you can't host a renderer. We keep the door open to later move export to a Remotion Lambda / Cloud Run worker without changing the composition.

## What gets deleted
- `src/lib/ugc-video.functions.ts` (HeyGen submit/poll/script)
- HeyGen UI bits inside `src/components/dashboard/ugc-generator.tsx`
- The `HEYGEN_API_KEY` / `HEYGEN_TEMPLATE_ID` secrets become unused (we'll tell the user they can delete them)

## What gets added

### 1. Voiceover server function — `src/lib/reel-voiceover.functions.ts`
- Input: a `DupePair`.
- Calls Lovable AI to write a **4-segment script** (hook / scan / compare / CTA), one short line each (~6–10 words), tuned for TikTok pacing.
- For each segment, calls ElevenLabs TTS (`eleven_turbo_v2_5`, voice `EXAVITQu4vr4xnSDxMaL` Sarah by default) — returns base64 MP3.
- Probes each MP3 duration in-browser (decode via `AudioContext.decodeAudioData`) — server returns base64 + a server-side duration estimate using the MP3 frame header as a fallback.
- Returns `{ segments: [{ text, audioBase64, durationSec }] }`.
- Secret needed: `ELEVENLABS_API_KEY` (request via `add_secret` before coding).

### 2. Remotion composition — `src/remotion/DupeReel.tsx` + scenes
- 1080×1920, 30fps.
- 4 scenes inside a `<TransitionSeries>`, each `durationInFrames = round(segment.durationSec * 30) + 6` (small tail so audio doesn't clip).
- Per-scene `<Audio src={dataUrl}>` aligned to scene start — voiceover is *part of the composition*, so timing is exact by construction.
- Scenes:
  1. **Hook** — original product photo zooms in on coral gradient bg, kinetic type ("Still paying $X for this?") springs in word-by-word.
  2. **Scan** — phone-frame mockup with scanning bracket SVG sweeping over the original product, subtle parallax.
  3. **Compare** — split screen: original (left, dimmed) vs dupe (right, highlighted), animated `$X → $Y` price counter, big `XX% MATCH` badge spring.
  4. **CTA** — dupli wordmark scales in, "Find your dupe" headline, App Store badge slide-up.
- Shared motion system: spring `{ damping: 18, stiffness: 180 }`, `clockWipe` between scenes, Inter Display + Inter from `@remotion/google-fonts`.
- Brand palette pulled from existing `src/styles.css` (coral primary, off-white, deep ink).

### 3. UI — rewrite `src/components/dashboard/ugc-generator.tsx`
- Button → pick pair → generate script + voiceovers (server) → mount `<Player>` with inputProps `{ pair, segments }`.
- Live in-browser preview (`<Player controls loop>`), 9:16 aspect, fits dashboard card.
- "Download MP4" button → uses a small `src/lib/record-player.ts` helper that:
  - Drives the `<Player>` ref frame-by-frame at 30fps via `playerRef.current.play()` while capturing the underlying `<canvas>` with `MediaRecorder` + a `MediaStreamAudioDestinationNode` mixing the four audio elements.
  - Outputs a `video/webm;codecs=vp9,opus` blob (broadly supported; we label the download `.webm` and note MP4 conversion is one click in any tool — or we transcode with the existing `ffmpeg.wasm` in `src/lib/ffmpeg-compose.ts` to true `.mp4`).
- Loading states: "Writing script…", "Recording voiceover…", "Rendering preview…".

### 4. Deps to add
- `remotion`, `@remotion/player`, `@remotion/transitions`, `@remotion/google-fonts`
- (Already present: `@ffmpeg/ffmpeg`, `@ffmpeg/util` — reused for optional webm→mp4 transcode.)

## Order of execution
1. Request `ELEVENLABS_API_KEY` secret (block until set).
2. Install Remotion player deps.
3. Build voiceover server function + script prompt.
4. Build Remotion composition + 4 scenes.
5. Rewrite `ugc-generator.tsx` around `<Player>` + record helper.
6. Delete `src/lib/ugc-video.functions.ts` and HeyGen references.
7. Manual smoke test from the dashboard.

## Open question
Voice: default to Sarah (`EXAVITQu4vr4xnSDxMaL`) or do you want a male voice (e.g. Liam) / pick a specific one from ElevenLabs? I'll default to Sarah if you don't specify.
