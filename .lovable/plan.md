## Problem

The MP4 download fails because the dev/SSR build is throwing `SyntaxError: Unexpected token (150:2)` in `src/lib/reel-voiceover.functions.ts`. Source code is syntactically valid — the error comes from TanStack's `start-compiler-plugin` server-fn splitter, which produces broken output when a `.functions.ts` file contains plain helpers alongside `createServerFn` declarations.

The file currently mixes a `createServerFn` (`generateReelScript`) with several module-level helpers (`estimateMp3DurationSec`, `writeScript`, `parseScriptJson`, `tts`, `VOICE_ID`, prompt builders). The splitter rewrites the file for client + server bundles and mangles `tts`'s body, leaving a stray `);` around line 150 of the transformed output — which is what Babel chokes on. This is the exact pattern called out in the `tanstack-serverfn-splitting` / `tanstack-supabase-import-graph` rules: **keep `.functions.ts` files thin — `createServerFn` declarations + imports only**.

## Fix

1. Create `src/lib/reel-voiceover.server.ts` and move into it all the server-only helpers currently in `reel-voiceover.functions.ts`:
   - `estimateMp3DurationSec`
   - `writeScript` (and its prompt-building code that reads `LOVABLE_API_KEY`)
   - `parseScriptJson`
   - `VOICE_ID` constant
   - `tts` (reads `ELEVENLABS_API_KEY`)
2. Slim `src/lib/reel-voiceover.functions.ts` down to:
   - Imports (including the helpers from `./reel-voiceover.server`)
   - Exported types (`ReelSegmentKey`, `REVEAL_KEYS`, `ReelSegment`, `ReelScript`)
   - The single `generateReelScript = createServerFn(...).inputValidator(...).handler(...)` declaration, whose handler now just calls `writeScript` + `tts`.
3. No behavior changes — same prompt, same voice, same settings. Only file layout changes so the server-fn splitter stops corrupting the bundle.

## Verify

- Re-load preview; the SSR `Unexpected token (150:2)` error should disappear.
- Run the UGC generator → "Download MP4" end-to-end and confirm script + voiceover + render succeed.
