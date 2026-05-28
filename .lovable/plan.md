# Switch from fal.ai to HeyGen talking-avatar UGC

## What we're doing
Delete the entire broken fal.ai scan-clip flow and replace it with a HeyGen-based talking-avatar UGC generator. User picks/triggers a scan → we generate a short script with Lovable AI → HeyGen renders a vertical talking-avatar video reviewing the dupe → we save the MP4 URL and play it inline.

## What gets deleted
- `src/lib/dashboard-video.functions.ts` (fal.ai submit/poll/stills logic)
- `src/components/dashboard/video-generator.tsx` (current UI tied to fal flow)
- Image-caching-for-video helpers added to `src/lib/product-images.server.ts` (`uploadProductImageDataUrl`, `assertStoredImageUrl`) — keep only what other features still need
- All references in `src/routes/dashboard.tsx`

## What gets added
1. **Secret**: `HEYGEN_API_KEY` (user grabs from HeyGen → Settings → API → Subscriptions tab)
2. **DB migration**: add `ugc_video_url`, `ugc_video_status` ('idle'|'pending'|'ready'|'failed'), `ugc_video_id`, `ugc_video_error` columns to `scans` table
3. **Server functions** in `src/lib/ugc-video.functions.ts`:
   - `generateUgcScript(scanId)` — uses Lovable AI (`google/gemini-3-flash-preview`) to write a 2-sentence "honest UGC review" script comparing the original vs the dupe
   - `submitHeyGenVideo(scanId)` — calls `POST https://api.heygen.com/v2/video/generate` with a default stock avatar + voice, the generated script, vertical 720×1280, saves the returned `video_id` and sets status='pending'
   - `pollHeyGenVideo(scanId)` — calls `GET https://api.heygen.com/v1/video_status.get?video_id=...`, on `completed` saves `video_url` and status='ready'; on `failed` saves the real error message (no more hiding behind IN_PROGRESS)
4. **UI** in `src/components/dashboard/ugc-generator.tsx`:
   - Button: "Generate UGC review"
   - While pending: spinner + live elapsed-time counter ("0:42 / ~2:00") + the actual HeyGen status, polling every 5s
   - On ready: inline `<video controls>` playing the MP4
   - On failed: show the real error message + retry button

## Avatar/voice defaults
We'll hard-code a single HeyGen stock avatar + voice ID to start (cheapest path, no per-user picker). Easy to expose a picker later.

## Cost
~$0.30–0.50 per ~30s video on HeyGen's API plan. User needs an active HeyGen API subscription ($99/mo entry tier as of late 2024) — confirm they have one before we wire the key.

## Order of execution
1. Confirm plan + user confirms they have a HeyGen API subscription
2. DB migration for the new `scans` columns
3. Request `HEYGEN_API_KEY` secret
4. Write server functions + new UI component
5. Delete old fal.ai files + clean up `dashboard.tsx`
6. Test end-to-end with one scan

## Open question for you
HeyGen API requires a **paid** API subscription (not the free web tier). Do you already have one active? If not, that's the blocker before we touch code.
