## Goal

When the AI identifies a dupe, also show a real photo of that dupe so the user can recognize it on a shelf.

## Approach

Two viable options. I recommend **Option A** for v1 — it's faster, free, and returns real product packaging shots.

### Option A (recommended): Google Shopping image via a server-side image search

After the AI returns the dupe's brand + product name, do a second server-side request to Google's image search and pull the first product image URL. No API key needed; we already proxy through our server function so there's no CORS issue.

Pros:
- Returns a real, recognizable product photo (actual packaging).
- Free, no extra API/secret to wire up.
- Stays consistent with our "Shop on Google" CTA.

Cons:
- Scraping HTML is fragile; Google can change markup. We'll wrap it in a try/catch and gracefully fall back to no image.

### Option B: AI-generated image (Nano Banana)

Use `google/gemini-2.5-flash-image` to generate a stylized product render.

Pros: always returns something; on-brand visuals.
Cons: not the real product (could mislead users on a "find the dupe" app); slower; uses extra credits.

I'll implement Option A and keep the dupe card resilient when no image is found.

## Changes

### Backend (`src/server/scan.functions.ts`)
- Add `imageUrl?: string` to `DupeSuggestion`.
- After the AI tool call resolves, if a dupe was found, call a new helper `findProductImage(brand, productName)` that:
  - Queries `https://www.google.com/search?tbm=isch&q=<brand+productName>` with a desktop User-Agent.
  - Extracts the first usable image URL (not a Google logo/sprite) from the HTML.
  - Returns `undefined` on any failure or empty result.
- Attach the URL to the dupe before returning. Wrap in `try/catch` so a scrape failure never breaks the scan.

### UI (`src/components/dupe-card.tsx`)
- In the "The dupe" side of the comparison grid, render the image above the brand/name when `dupe.imageUrl` exists.
- Use a fixed aspect-ratio container (`aspect-square`, rounded, `object-contain`, neutral background) so layout stays stable even if the image fails to load.
- Add `onError` handler that hides the image if the URL 404s.

### Optional polish
- Lazy-load the image (`loading="lazy"`).
- Add a subtle skeleton while loading.

## Technical notes

- The scrape runs server-side inside the existing `scanProduct` server function — no client CORS concerns, no exposed keys.
- Total added latency: ~300-700ms per scan. Acceptable since the AI call is already 2-4s.
- If we later want higher reliability, we can swap `findProductImage` for the Firecrawl `search` API or SerpAPI without changing the UI contract.
