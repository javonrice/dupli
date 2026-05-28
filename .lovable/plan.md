## Goal

Turn one-off video downloads into a real 30-day content pipeline: batch-generate 5/10/15/30 reels at once, every reel auto-saves to your library, bulk-download as a zip, and each video comes with a ready-to-paste TikTok caption with 5 hashtags.

## What you'll get

1. **Batch generator** — pick 5, 10, 15, or 30 and the app queues that many reels using your saved scans (your dupe discoveries). Progress bar shows "Rendered 7 / 30".
2. **My Videos library** on the dashboard — every reel auto-saved with thumbnail, product names, date, caption, download.
3. **Bulk zip download** — "Select all" → `dupli-videos.zip`.
4. **Auto-generated caption** per video — UGC-style hook + 5 dupe-community hashtags, one-click "Copy caption".

## How it works

### 1. Batch generation
- New **Batch** panel on `/dashboard` with chips: `5 · 10 · 15 · 30`.
- Pulls from your saved scans (and, if you don't have enough saved, falls back to top trending dupes) so each reel uses a real product pair.
- Runs sequentially in the browser tab (one render at a time so ffmpeg.wasm doesn't OOM), with a live progress bar and per-item status (queued / scripting / rendering / saved / failed).
- Failed items can be retried individually; you can leave the tab open and walk away.
- Safety cap: 30 max per batch; rate-limited per minute.

### 2. Storage
- New Cloud storage bucket `user-videos` (private, owner-scoped).
- Each MP4 uploaded to `user-videos/{user_id}/{video_id}.mp4` after render.

### 3. Database
- New `user_videos` table: original product, dupe product, storage path, thumbnail URL, caption text, status, created_at.
- RLS: users only see/insert/update/delete their own rows.

### 4. Caption generation
- Lovable AI (`google/gemini-2.5-flash`) writes a short, natural UGC-style caption from the dupe context.
- Exactly **5 hashtags** appended, drawn from a curated dupe-community pool and rotated per video so they don't look spammy:
  - Pool: `#dupe` `#dupealert` `#dupesoftiktok` `#beautydupes` `#affordablebeauty` `#makeupdupes` `#skincaredupes` `#luxuryforless` `#savemoney` `#tiktokmademebuyit`
  - Always includes `#dupe` + one category tag matched to product type.

### 5. My Videos UI
- Grid of saved reels: thumbnail, "Original → Dupe", date, **Download**, **Copy caption**, **Delete**.
- Top bar: **Select all** + **Download selected (.zip)** via `jszip`.
- Existing single-reel download keeps working — it just also saves a copy now.

## Technical details

- Migration: create `user_videos` table + GRANTs + RLS + `user-videos` storage bucket + storage policies scoped by `auth.uid()::text = (storage.foldername(name))[1]`.
- `src/components/dashboard/batch-generator.tsx`: new component, queue state machine, calls existing script + render pipeline per item.
- `src/components/dashboard/ugc-generator.tsx`: after `renderReelToMp4`, upload blob to storage, insert `user_videos` row, generate caption.
- New `src/lib/captions.functions.ts` + `captions.server.ts` (Lovable AI + hashtag picker).
- New `src/lib/user-videos.functions.ts`: `listMyVideos`, `deleteMyVideo`, `getSignedVideoUrl`, `pickBatchCandidates`.
- New `src/components/dashboard/my-videos.tsx`: grid + bulk-select + jszip bundler.

## Cost & timing heads-up

- ~30 reels ≈ 30× your current per-video cost (script + TTS + render). Batch of 30 takes roughly 30 × current render time in one open tab.

## Out of scope (for this round)

- Direct posting to TikTok/Instagram
- Calendar / scheduling view
- Server-side rendering (still uses your browser's ffmpeg.wasm)
- Editing caption text in-app (copy → edit in TikTok)
