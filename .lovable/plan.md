# Switch UGC Generator to Remotion Lambda Rendering

## Goal

Replace the slow, flaky in-browser render (WebCodecs → ffmpeg.wasm) with the existing Remotion Lambda integration. Keep the browser path as an automatic fallback if Lambda isn't configured or fails to start.

## Why now

The Lambda code path (`src/lib/lambda-render.functions.ts`) is fully built — `startLambdaRender` + `getLambdaRenderProgress` server fns, AWS SDK wiring, and the `/api/download-video` proxy for streaming the S3 MP4 — and all required secrets are already set (`REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_SERVE_URL`, `REMOTION_AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). The original blocker (image fetches failing inside Lambda's headless Chrome) is no longer an issue because the UGC generator already proxies every product image to a data URL before sending the script.

## Step 1 — Add `renderAndSaveReelViaLambda` in `src/lib/reel-pipeline.ts`

New exported async function, sibling to `renderAndSaveReel`. Signature:

```text
renderAndSaveReelViaLambda({
  script,
  pairs,
  saveRecord,
  onProgress,
})
```

Behavior:
1. Call `startLambdaRender({ data: { script } })` → `{ renderId, bucketName }`.
2. Poll `getLambdaRenderProgress({ data: { renderId, bucketName } })` every 2s.
3. On each tick, call `onProgress({ stage: "frames", pct: overallProgress })` so the existing bar moves.
4. If `fatalErrorEncountered` or `errors.length > 0` → throw with the joined messages.
5. When `done`, fetch the MP4 via `/api/download-video?url=<outputFile>&filename=<slug>.mp4` to get a Blob.
6. Upload the Blob to `user-videos` and call `saveRecord(...)` — identical to the existing pipeline.
7. Return `{ blob, storagePath, saved }` so the caller can reuse `downloadBlob`.

## Step 2 — Wire it into `src/components/dashboard/ugc-generator.tsx`

- Import `renderAndSaveReelViaLambda` from `reel-pipeline`.
- Add `renderMode` state: `"lambda" | "browser"`, default `"lambda"`.
- In the existing "Render & Download" handler:
  1. `try` Lambda path first. On the first await (start call), if it throws, log and fall through to browser path with a toast/inline note ("Cloud render unavailable, rendering locally").
  2. Keep the rest of the flow (set blob, autodownload, surface "saved to My Videos") identical.
- Leave the hidden `<Player>` and `captureRef` in the DOM untouched — the browser fallback still needs them.
- Update the button label (currently mentions "No upload, no Lambda") to "Render & Download".

## Step 3 — Progress label tweak

In the progress section, when `renderMode === "lambda"` show a single label "Rendering in cloud…" + percentage instead of the per-stage frame labels. Browser path keeps current stage labels.

## Step 4 — Verification (after build mode)

1. Generate a script, click Render & Download — confirm progress climbs and the MP4 downloads in ~20–60s.
2. Confirm new entry shows up in My Videos.
3. Temporarily simulate Lambda failure (e.g. invoke with bad input via dev tools) → browser path takes over without a crash.
4. Check `server-function-logs` for any `startLambdaRender` / `getLambdaRenderProgress` errors.

## Explicitly out of scope

- Do **not** delete `render-reel.ts` or any browser-render code — it's the fallback.
- Do **not** re-deploy the Remotion site bundle (`deploy-lambda.mjs`) unless the first Lambda render fails because the deployed site is stale. If it does fail with image-load errors, that step gets added.
- Do **not** touch `/api/download-video`, image proxy, or the Supabase upload path — they already work.
- Do **not** change `MyVideos` or the photo carousel generator.

## Technical notes

- `getLambdaRenderProgress` already handles AWS throttling with exponential backoff internally, so a flat 2s poll on the client is fine.
- `startLambdaRender` reads env at call time inside the handler — if any of the 4 AWS/Remotion env vars are missing it throws a clear "Lambda env not configured" error, which is exactly the signal the fallback uses.
- The S3 output URL returned by Lambda matches the `isAllowedRemotionUrl` allowlist in the download proxy (`remotionlambda-*.amazonaws.com/*.mp4`), so no proxy changes are needed.
