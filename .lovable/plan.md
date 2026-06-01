# Fix: "Not signed in" error in Lambda render path

## Root cause

`renderAndSaveReelViaLambda` calls `supabase.auth.getUser()` (line 186-188 of `src/lib/reel-pipeline.ts`) to grab the user id for the temp-asset storage path. `getUser()` makes a network round-trip to `/auth/v1/user` to revalidate the JWT. If that call returns no user (cold session, network blip, or it races with session hydration after the page first lands on `/dashboard`), we throw "Not signed in" and fall back to the slow browser render — even though the user is clearly signed in (they're on a guarded route).

We don't actually need to *authenticate* here. We just need the user's id to build the storage key `${userId}/render-tmp/...`. RLS on the `user-videos` bucket will enforce auth on the upload itself.

## Change

In `src/lib/reel-pipeline.ts` `renderAndSaveReelViaLambda`:

- Replace `supabase.auth.getUser()` with `supabase.auth.getSession()` (reads from local storage, no network, no race).
- Pull `userId` from `session.user.id`.
- Keep the `if (!userId) throw new Error("Not signed in")` guard (now only fires for genuinely-unsigned users).

Also mirror the same change in the existing browser-fallback path further down (lines 76 + 229) for consistency, since they have the same theoretical race even though they haven't been reported failing.

No other files change. Lambda flow, externalization, polling, and download proxy stay as-is.

## Verification

- Trigger a UGC reel render from `/dashboard` — Lambda path runs end to end, no "falling back to browser" log.
- Sign out, then call the same path manually → still throws "Not signed in" (guard still works).
