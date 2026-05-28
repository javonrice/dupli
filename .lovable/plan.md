## Goal
Stop depending on skinsort's CDN at video-generation time. Cache product images once into our own Supabase storage bucket and reuse that URL everywhere.

## Steps

### 1. Migration
- Create public storage bucket `product-images` (public read).
- Add storage RLS: public SELECT on bucket; INSERT/UPDATE restricted to service_role (server-only writes).
- Add column `products.cached_image_url text` for the resolved bucket URL.

### 2. Server helper `ensureCachedProductImage(productId)`
New file `src/lib/product-images.server.ts` + thin wrapper in `src/lib/product-images.functions.ts`.
- If `products.cached_image_url` is set → return it.
- Else fetch `image_url` server-side with browser-like headers (UA + Referer) → upload bytes to `product-images/{brand_slug}/{product_slug}.{ext}` via `supabaseAdmin.storage` → write public URL back into `products.cached_image_url` → return it.
- Idempotent + safe to call from multiple flows.

### 3. Wire into video pipeline (`src/lib/dashboard-video.functions.ts`)
- `generateScanClip`: replace the inline skinsort-fetch-and-base64 hack with a call to `ensureCachedProductImage`, then pass the resulting public URL as `image_url` to fal.ai. fal.ai can fetch our bucket fine.
- `generateVideoStills`: same — resolve product images through the cache before sending to Nano Banana.
- Remove the spoofed-headers fetch block.

### 4. (Optional but recommended) Carousel parity
Also route `generateCarouselSlides` image URLs through `ensureCachedProductImage` so the carousel stops depending on skinsort too. One consistent code path.

## Out of scope
- Backfill job for every product in the DB — not needed; cache fills lazily on first use of each pair. (Easy to add later if we want to pre-warm.)
- Image transformations / resizing.

## Result
First time a product pair is used → one skinsort fetch ever, from our server. After that, all consumers (fal.ai, Nano Banana, OG images, emails) pull from `product-images.lovable-cloud-cdn` and skinsort is out of the loop.