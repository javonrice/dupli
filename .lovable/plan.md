# Fix "stuck on Generating scan clip…" hang

## Root cause

`generateScanClip` in `src/lib/dashboard-video.functions.ts` submits a fal.ai job then sits in a `while` loop polling for up to **180 seconds** inside one server function call.

Cloudflare Workers (the runtime our TanStack server fns deploy to) terminate long-running requests. When that happens mid-poll:
- fal.ai still bills you (the job was already submitted — that's the 10¢)
- the server fn never returns
- the browser fetch hangs until *its* timeout fires, which is why the UI sits on "Generating scan clip…" indefinitely

`generateVoiceover` and `generateVideoStills` finished fine in parallel — only the fal poll is the problem.

## Fix: client-side polling

Split the scan-clip step into two small server functions and let the client poll.

### 1. `src/lib/dashboard-video.functions.ts`

Replace `generateScanClip` with:

- **`submitScanClip`** — submits the fal.ai job, returns `{ requestId, statusUrl, responseUrl }`. Returns in ~1s.
- **`pollScanClip`** — takes `{ statusUrl, responseUrl }`, does ONE status check, returns `{ status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED', videoUrl?: string }`. Returns in <1s.

Each call stays well under any Worker timeout.

### 2. `src/components/dashboard/video-generator.tsx`

In `handleGenerate`, replace the single `scan({...})` call inside `Promise.all` with:

1. Call `submitScanClip` to kick off fal.ai (parallel with voiceover + stills, same as today).
2. After `Promise.all` resolves, run a client-side `while` loop that calls `pollScanClip` every 3s for up to ~3 minutes.
3. Surface `IN_QUEUE` / `IN_PROGRESS` as the "Generating scan clip…" label (no behavior change for the user, but now it can't silently hang — every 3s we get a real response or a real error).
4. On `COMPLETED`, continue to `fetchScanClipBytes` → stills → compose, as today.
5. On `FAILED` or timeout, throw → existing `catch` shows the red error banner.

### 3. Defensive: surface errors better

Today if the catch fires the error banner appears above the phone frame, but the spinner overlay covers it visually if the user has scrolled. Tiny tweak: also `console.error(e)` in the catch so the next time you DM me a screenshot we have something in devtools to look at.

## Out of scope

- Persisting fal.ai jobs in Supabase so they survive page reloads (overkill for a standalone tool you trigger and watch).
- Backgrounding the whole pipeline (would need a job table + worker).

## Expected outcome

- "Generating scan clip…" never lasts longer than 3s without either advancing or showing a real error.
- A successful fal.ai job (~30–60s typical) flows through to compose and renders the mp4 just like before.
- The 10¢ you already spent is sunk — fal.ai charges on submit, not on result delivery.
