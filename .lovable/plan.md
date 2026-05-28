## Goal

Strip the batch generator out of the dashboard and focus the product on the single Dupe Reel generator + its download flow.

## Changes

1. **Remove the batch UI**
   - Delete `src/components/dashboard/batch-generator.tsx`.
   - Remove its import and usage from the dashboard route (wherever `<BatchGenerator />` is mounted).
   - Drop any "30 days of content / batch" copy around it.

2. **Remove batch-only helpers**
   - Audit and delete anything only used by the batch generator (e.g. `pickRandomDupePairs` if unused elsewhere, batch-specific status/debug types).
   - Keep `renderAndSaveReel`, `generateReelScript`, `saveVideoRecord`, and the Remotion `DupeReel` — the single generator uses them.

3. **Tighten the single generator's download path**
   - Keep the visible `<Player>` preview (it's the reason single works — images decode before capture).
   - On "Download": call the same `renderAndSaveReel` pipeline, then trigger a browser download of the resulting MP4 blob (and still save the record to My Videos).
   - Surface progress (`scripting → frames → encode`) and the frame-failure debug panel inline under the button, reusing the existing `onProgress` / `onDebug` callbacks.

4. **Cleanup**
   - Remove now-unused imports (`Layers` icon, batch types).
   - Leave `render-reel.ts` and `ffmpeg-compose.ts` as-is — they're shared.

## Open question

Where does the single generator live today? If it's `src/components/dashboard/single-generator.tsx` (or similar), I'll wire the download button there. If you'd rather I also rename/restructure it (e.g. make it the dashboard's primary hero), say the word.