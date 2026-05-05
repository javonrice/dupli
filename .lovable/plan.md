## Goal

Replace the native iOS/Android camera handoff with an in-app camera screen: dupli wordmark header, live viewfinder, animated corner brackets, custom shutter, and a close button. Captures feed into the existing `scanProduct` pipeline — no backend changes.

## What changes for the user

- Tapping the FAB → "Take Photo" no longer launches Apple's camera app. Instead, a full-screen in-app camera opens with our chrome on top of the live preview.
- "Choose from Library" still uses the hidden file input (unchanged).
- After tapping the shutter, the existing scanning state and results screen run exactly as today.

## What we're NOT building (deliberate cuts)

- No flash/torch button. Safari doesn't expose `MediaStreamTrack` torch constraints, and we want zero buttons that don't actually work.
- No library button inside the camera (the FAB sheet already offers "Choose from Library" — no need to duplicate).
- No live "Product detected" pill while aiming. Real-time Gemini calls per frame are too slow/expensive.
- No pinch-zoom, tap-to-focus, front/back swap, or barcode fast-path in v1.

## New files

- `src/components/camera/live-camera.tsx` — full-screen camera component. Owns the `<video>`, the overlay chrome, and renders the dupli wordmark header.
- `src/lib/use-camera-stream.ts` — hook that requests `getUserMedia({ video: { facingMode: 'environment' } })`, manages start/stop, and exposes `videoRef`, `error`, and `capture()` returning a JPEG dataURL via an offscreen canvas.

## Files to modify

- `src/lib/use-scan-flow.ts` — add `cameraOpen` state plus `openLiveCamera()` / `closeLiveCamera()`. `openCamera` (FAB action) now opens the live camera instead of clicking the hidden file input. The hidden camera `<input>` is removed; the library `<input>` stays for the FAB's "Choose from Library" path.
- Wherever `useScanFlow` is rendered (Discovery Hub, etc.) — render `<LiveCamera />` when `cameraOpen` is true, wired to `handleFile(dataUrl)` on shutter and `closeLiveCamera()` on dismiss.

## UI structure (matches the mockup, trimmed)

```text
┌─────────────────────────────────┐
│  ✕            dupli             │  top bar (safe-area padded)
│                                 │
│      ┌─┐                 ┌─┐    │  corner brackets (subtle pulse)
│                                 │
│         [ live <video> ]        │
│                                 │
│      └─┘                 └─┘    │
│                                 │
│              ( ⚪ )              │  shutter only
└─────────────────────────────────┘
```

- Uses existing tokens (`bg-background`, `text-foreground`, `tap`, safe-area padding).
- Corner brackets: 4 absolutely-positioned divs with 2px borders, ~10% inset.
- Shutter: 72px white ring with inner fill, centered above the safe-area inset.
- Header uses the `dupli` wordmark exactly as the rest of the app renders it.

## Capture flow

1. User taps shutter → draw current `<video>` frame to an offscreen `<canvas>` at native resolution.
2. `canvas.toDataURL('image/jpeg', 0.9)` → pass into the existing scan path. Reuse `downscaleImage(dataUrl, 1024)` so payload size matches today.
3. Stop the `MediaStream` tracks immediately to release the camera.
4. `useScanFlow` transitions to `scanning` → `results` exactly as today.

## Permissions and edge cases

- First open prompts for camera permission. If denied or `getUserMedia` throws, show a centered fallback message with a single "Close" action. The user can still use "Choose from Library" from the FAB sheet.
- iOS Safari: `<video>` will have `playsInline` and `muted` so it renders inline.
- On unmount or close, stop all tracks (cleanup in the hook's `useEffect` return).
- HTTPS only — preview and production are HTTPS, so this is fine.

After approval I'll implement the hook, the `LiveCamera` component, and rewire `useScanFlow` + the FAB.