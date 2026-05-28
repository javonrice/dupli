## Plan

1. **Fix the current batch failure**
   - Remove the duplicate `decodeCtx.close()` call in `src/lib/render-reel.ts` that is causing `Cannot close a closed AudioContext`.
   - Wrap AudioContext cleanup in a safe `finally` block so decode errors still clean up once without throwing a misleading secondary error.

2. **Make debug output more accurate**
   - Add an `audio-context` debug cause (or classify this as audio cleanup) so closed-context lifecycle issues are distinguishable from audio decode failures.
   - Emit the segment key/frame context when audio decode or audio cleanup fails.

3. **Prevent stale/bad failed labels**
   - Ensure the batch item error shown in the pill reflects the real root failure, not a cleanup error caused after successful decode.
   - Keep existing image/network/font frame debug details intact.

4. **Validate the fix**
   - Re-run the relevant checks after implementation and confirm the duplicate close path is gone and debug entries still render in the batch generator.