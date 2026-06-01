## Photo Carousel Generator

A new row on `/dashboard` (below the existing Nano Banana generator) that takes 5 user-uploaded photos, runs each through our existing `scanProduct` flow, and produces an 11-slide Instagram carousel rendered entirely client-side as 1080×1350 PNGs.

### Slide order (11 total)

```
1.  Photo #1 + overlay text "Scanning to find dupes so you don't have to"
2.  Share card for Photo #1   (ShareCard component → PNG)
3.  Photo #2  (plain, no overlay)
4.  Share card for Photo #2
5.  Photo #3
6.  Share card for Photo #3
7.  Photo #4
8.  Share card for Photo #4
9.  Photo #5
10. Share card for Photo #5
11. Static App Store CTA slide (real Apple logo, branded)
```

### New component

`src/components/dashboard/photo-carousel-generator.tsx`

UI:
- 5 file-drop slots (one row of thumbnails). User picks 5 images.
- "Generate carousel" button — disabled until 5 are loaded.
- Progress strip: `Scanning 2/5…` as each photo is processed.
- Results grid: 11 thumbnails (matches existing carousel grid). Each has its own ⬇ Download button (PNG). No ZIP.
- Retry button per failed scan.

Wired into `src/routes/dashboard.tsx` as a new section between `<UgcGenerator />` and `<MyVideos />`.

### Rendering pipeline (all client-side, no new server functions)

For each photo:
1. Read file → data URL → `downscaleImage(..., 1024)` (reuse helper from `use-scan-flow.ts` — extract into `src/lib/image-utils.ts`).
2. `scanProduct({ imageDataUrl })` via `useServerFn` — existing function, no changes.
3. With the returned `DupeAnalysis`, render `<ShareCard>` off-screen and rasterize with `html-to-image` → PNG data URL. (Already a project dep; same approach used by `/scan/$id/share`.)

For the photo-only slides:
- Render a 1080×1350 `<div>` with the photo as `object-cover` background + brand wordmark in corner. For slide 1, overlay bold headline "Scanning to find dupes so you don't have to" in a frosted bar. Rasterize same way.

For the CTA slide:
- Static React component `<AppStoreCtaCard>`: deep coral→pink gradient, large `dupli` wordmark, headline "Find your dupe.", subtext, real Apple logo (inline SVG path — official Apple "" glyph as SVG) inside a black "Download on the App Store" pill. Rendered to PNG once.

### File changes

- **Add** `src/components/dashboard/photo-carousel-generator.tsx` — the UI + pipeline orchestration.
- **Add** `src/components/dashboard/carousel-photo-slide.tsx` — 1080×1350 photo slide (optional overlay), forwarded ref for html-to-image.
- **Add** `src/components/dashboard/app-store-cta-card.tsx` — 1080×1350 CTA slide with inline Apple-logo SVG.
- **Add** `src/lib/image-utils.ts` — extract `fileToDataUrl` + `downscaleImage` from `use-scan-flow.ts` so both can share them (no behavior change to the scan flow).
- **Edit** `src/routes/dashboard.tsx` — render `<PhotoCarouselGenerator />` in its own row.

### Out of scope

- No new server functions, no Supabase writes, no `dashboard_generations` records (these are user-supplied photos, not catalog pairs).
- No ZIP export, no auto-download all.
- Existing Nano Banana carousel + UGC reel rows stay untouched.
