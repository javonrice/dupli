# Social Content Generator Dashboard

A password-protected `/dashboard` route where you generate viral-style 4-slide Instagram carousels (1:1) for Dupli. Each generation picks a fresh product + its top dupe from the database and uses Nano Banana (`google/gemini-2.5-flash-image`) to create four branded slides.

## Access Control

- New route: `src/routes/dashboard.tsx` (NOT under `_app/` — separate from the user app, no tab bar).
- Single shared password gate. Password stored as a runtime secret `DASHBOARD_PASSWORD` (I'll request it via `add_secret`).
- Flow: enter password → POST to a server fn `verifyDashboardPassword` → on success, set a signed httpOnly session cookie (`dupli_dash`, 7-day expiry, HMAC-signed with `DASHBOARD_SECRET`). All generator server fns check the cookie and 401 otherwise.
- No Supabase auth involved — this is a separate, internal gate.
- `dashboard` excluded from `llms.txt` / sitemap.

## The 4 Slides

For a chosen `(original, dupe)` pair:

1. **Hook / product reveal** — original product rendered hero-style on branded backdrop. Bold overlay: "Paying $X for {brand}?"
2. **Scan moment** — a hand holding a phone scanning the original on a drugstore-style shelf, phone screen showing the Dupli scanning UI (reuse the same prompt language as your existing onboarding-scan-product image).
3. **Results / comparison** — original vs dupe side-by-side with the match % badge and both prices (same visual logic as in-app dupe cards).
4. **CTA** — Dupli wordmark + "Find your dupe. Download Dupli" + App Store badge styling.

All 4 generated at 1024×1024. Each slide gets the Dupli wordmark composited in a corner (server-side via a small canvas/sharp-free overlay using the existing PNG wordmark passed as a reference image to Nano Banana — Gemini handles "include the Dupli logo in the bottom-right" reliably when given the wordmark as an input image).

## Generation Flow

1. User clicks **Generate new carousel**.
2. Server fn `pickRandomDupePair` (uses `requireDashboardAuth` middleware):
   - Picks a random `dupes` row with `overall_match >= 70` AND both products have `image_url` AND `lowest_price_usd` (so the price-comparison slide is real).
   - Excludes any pair already generated in the last N hours (tracked in a new `dashboard_generations` table) to ensure freshness.
   - Returns `{ original, dupe, matchPct, savings }`.
3. Server fn `generateCarouselSlides` calls Nano Banana 4× in parallel via the AI Gateway `/v1/images/generations` endpoint (model `google/gemini-2.5-flash-image`, messages + modalities shape, **non-streaming** — we want the final PNG for each slide, not progressive previews).
   - Each call receives: the original product image URL, the dupe product image URL (slide 3 only), the Dupli wordmark PNG (all slides), and a slide-specific prompt template.
   - Returns 4 base64 PNGs.
4. UI renders all 4 slides in a grid with a "Download all" button (zips client-side via `jszip`) and per-slide download.
5. Insert a row into `dashboard_generations` so the same pair isn't picked again soon.

## New Database Table

```sql
CREATE TABLE public.dashboard_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  dupe_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.dashboard_generations TO service_role;
ALTER TABLE public.dashboard_generations ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — only accessed via service_role from server fns.
CREATE INDEX idx_dashboard_gen_recent ON public.dashboard_generations (created_at DESC);
```

Server fns use `supabaseAdmin` (service role) for both selecting random pairs and inserting generation rows — bypasses RLS cleanly and keeps the dashboard fully separate from user data paths.

## Files

**New**
- `src/routes/dashboard.tsx` — gated shell (password form OR generator UI based on cookie).
- `src/lib/dashboard.functions.ts` — `verifyDashboardPassword`, `pickRandomDupePair`, `generateCarouselSlides` server fns.
- `src/lib/dashboard-auth.server.ts` — cookie sign/verify helpers + `requireDashboardAuth` middleware.
- `src/lib/slide-prompts.server.ts` — the 4 prompt templates.
- `src/components/dashboard/carousel-preview.tsx` — 4-slide grid + download controls.
- `src/components/dashboard/password-gate.tsx`.
- `supabase/migrations/<timestamp>_dashboard_generations.sql`.

**Modified**
- `public/llms.txt` (exclude `/dashboard`) if present.

**Secrets requested**
- `DASHBOARD_PASSWORD` — the shared password.
- `DASHBOARD_SECRET` — HMAC key for the session cookie (I'll auto-generate and add).
- `LOVABLE_API_KEY` — already provisioned for Lovable AI Gateway (no action needed).

**Dependencies**
- `jszip` for client-side bundle download.

## Technical Notes (for reference)

- Nano Banana via Gateway uses the OpenRouter chat-completions image shape with `messages` + `modalities: ["image", "text"]`. To pass the product image + wordmark as references, include them as `image_url` content parts inside the user message.
- Non-streaming response: read `data[0].b64_json`, return `data:image/png;base64,...` to the client.
- 4 parallel calls per generation. If any one fails (content policy etc.), surface a per-slide retry button rather than failing the whole carousel.
- Server fns return DTOs only (the 4 base64 strings + product metadata) — no streams/Response objects.

## Out of Scope (ask if you want these later)

- Posting directly to IG/TikTok
- Caption/hashtag generation (easy add via Gemini text model)
- Video / Reel format
- A library of past generations