# Fix: Share card shows wrong product image

## Problem
On each share-card slide, the left "you scanned" image is pulled from `result.original.imageUrl` (a stock URL the scanner returned), not from the photo the user actually uploaded. That URL is sometimes wrong — e.g. slide 2's card displays the SOLAR FLARE jar while the scan text correctly reads "Brazilian Caramel Dreams Body Butter." The result feels like the slides are mis-ordered, but it's the image source.

## Fix
In `src/components/dashboard/photo-carousel-generator.tsx`, change the `originalImg` for each scan to **always** be the user's uploaded photo (`photos[i].previewUrl`). The dupe image stays as-is (from the scanner). This guarantees every share card visually matches the photo slide that precedes it.

Specifically, in the scan loop (around line 216–224):
- Drop the `loadOne(result.original.imageUrl ?? photos[i].previewUrl)` call.
- Set `originalImg: photos[i].previewUrl` directly.
- Keep `dupeImg` loaded via the proxy as today.

## Out of scope
- Slide order/manifest logic — already correct.
- Scan accuracy / dupe selection — unchanged.
- App Store CTA and Hook slides — unchanged.
