## The headline

Build a real, portable, indexed dupe database in Supabase — not a CSV, not a JSON dump, not a markdown blob. The DB is **the asset**. Dupli reads from it; you can also point any future product (extension, API, partner integration, sellable dataset) at the same tables.

I tested SkinSort directly: pages are static HTML, no auth, no JavaScript needed, ~50 dupes per page with overall % match, ingredient % match, attribute % match, ingredients-in-common count, "free from" tags, "good for" tags, image URLs, and a written rationale. Better data than what our scanner currently invents.

**SkinSort is invisible to users.** Stored as `source: 'skinsort'` internally; never shown in the UI.

---

## Speed estimate

- ~60–80k product pages on SkinSort (50 dupes per page = ~3M pairs, matching their claim)
- 1 fetch + parse ≈ 2 sec; 50 dupe rows per fetch
- At a polite 1 req/sec: full corpus in **17–22 hours** (one weekend)
- Top ~5,000 most-popular products (covers the long tail of real scans): **~1.5 hours**

After backfill, a weekly delta crawl keeps it fresh in ~1–2 hours.

---

## Database design (the part you care about)

Designed so that anything you build later can drop in and use it: REST endpoint, second app, partner data feed, exported snapshot, anything. Three tables, normalized, fully indexed.

### `products` — the canonical product registry

Every brand+product combination becomes ONE row. Both originals and dupes live here — a "dupe" is just a product that's referenced from the dupes table. Reusable across your entire ecosystem.

```text
id                  uuid pk
brand_slug          text not null         -- 'cerave'
product_slug        text not null         -- 'moisturizing-cream'
brand_name          text not null         -- 'CeraVe' (display)
product_name        text not null         -- 'Moisturizing Cream' (display)
category            text                  -- 'General Moisturizer'
image_url           text                  -- storage.skinsort.com/...
source_url          text                  -- skinsort URL (internal only)
ingredients_count   int
free_from           text[]                -- ['fragrances','parabens']
good_for            text[]                -- ['dry skin','anti aging']
contains            text[]                -- ['silicones','sulfates']
search_vector       tsvector              -- generated, for full-text search
last_ingested_at    timestamptz
created_at          timestamptz default now()

unique (brand_slug, product_slug)
index on lower(brand_name)
index on search_vector USING GIN     -- fast text search
index on free_from USING GIN         -- fast tag filtering
index on good_for USING GIN
index on category
```

### `dupes` — the pair table

```text
id                       uuid pk
original_product_id      uuid references products(id) on delete cascade
dupe_product_id          uuid references products(id) on delete cascade
overall_match            int     -- 0-100
ingredient_match         int     -- 0-100
attribute_match          int     -- 0-100
shared_ingredients_count int
rationale                text    -- the "Dupe Explained" paragraph
rank                     int     -- position 1-50 on source page
source                   text default 'skinsort'
created_at               timestamptz default now()

unique (original_product_id, dupe_product_id)
index on (original_product_id, overall_match desc)   -- "give me top dupes for X"
index on (dupe_product_id, overall_match desc)       -- "what's this a dupe OF?"
index on overall_match desc                          -- "show top dupes globally"
```

This bidirectional indexing means **both lookup directions are O(log n)** — same speed whether the user scans the original or the dupe.

### `ingestion_queue` — the worker's todo list

```text
id              uuid pk
brand_slug      text
product_slug    text
reason          text     -- 'seed' | 'user_scan_miss' | 'refresh'
status          text     -- 'pending' | 'processing' | 'done' | 'failed'
priority        int      -- higher = sooner; user scan misses get +10
attempts        int default 0
last_error      text
created_at      timestamptz default now()
processed_at    timestamptz

unique (brand_slug, product_slug, status) where status = 'pending'
index on (status, priority desc, created_at)
```

### Why this design is portable & fast

- **Normalized** — one row per product, no duplication. A single brand rename updates one row, not 50.
- **Slugs are stable IDs** — `cerave/moisturizing-cream` works as a public URL key if you ever expose an API.
- **Indexed for every realistic query**:
  - "Top dupes for product X" — covered
  - "What's this product a dupe of?" — covered (reverse lookup)
  - "Search products by name" — full-text index
  - "All products good for dry skin without fragrance" — GIN array indexes
  - "All dupes with 90%+ match" — partial index possible
- **RLS read-open, write-locked** — any signed-in user / any future app of yours can SELECT; only your service role writes. Means you can publish a public read API tomorrow without re-architecting.
- **No Dupli-specific columns in the asset tables** — the dupe DB is reusable. App-specific stuff (user scans, saved scans) stays in the existing tables.

---

## How it works (runtime)

```text
User scans product photo
      ↓
scanProduct (existing) — AI identifies brand + product
      ↓
NEW: lookupDupes(brand, productName)
   1. Slugify → query products + dupes (single indexed JOIN)
   2. Hit?  Return real verified dupes (sub-50ms)
      Miss? Fall back to AI's invented dupe + enqueue for ingestion
      ↓
DupeAnalysis returned to UI — UI never knows where the data came from
```

Separate, **always-offline** ingestion worker fills the DB. Users never trigger SkinSort traffic.

---

## Build phases

### Phase 1 — Foundation (1 day)
- Migration: create `products`, `dupes`, `ingestion_queue` with all indexes + RLS
- `src/server/dupes.functions.ts` — `lookupDupes(brand, productName)` server function
- Wire `scanProduct` to call `lookupDupes` first, AI fallback second
- Auto-enqueue every miss

### Phase 2 — Ingestion (1 day)
- `src/server/skinsort-parser.ts` — parses the SkinSort markdown into typed dupe records (already validated against real pages — the format is consistent)
- `src/server/skinsort-slugs.ts` — brand+product → URL; falls back to a `site:skinsort.com` Google search via Lovable AI's `google_search` tool when the direct slug 404s; caches the resolved slug
- `src/routes/api/public/hooks/ingest-product.ts` — accepts one queue item, fetches, parses, upserts ~50 rows. Token-protected via `INGESTION_TOKEN` secret.
- `src/routes/api/public/hooks/run-ingestion.ts` — drains N queue items with rate limiting, jitter, and 429 backoff

### Phase 3 — Seed crawl (overnight; no dev work)
- One-time script to seed `ingestion_queue` from SkinSort's brand index pages
- pg_cron triggers `run-ingestion` every minute, processes ~60 items per minute (1 req/sec)
- Stop the cron when queue is drained

### Phase 4 — Continuous expansion (passive)
- Every user scan miss inserts into queue with `priority = 10`
- pg_cron flushes the queue every hour at low rate (covers misses immediately, refreshes cheaply)

---

## Portability — using the DB elsewhere later

Because the schema is clean and indexed, here's what's already free without extra work:

| Future use case                                    | What you need to add                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Browser extension that overlays dupes on Sephora   | Just the existing `lookupDupes` server fn — already public-readable          |
| Public REST API (`GET /api/v1/products/:slug/dupes`) | One thin route file, ~30 lines                                                |
| Sellable CSV / Parquet snapshot                    | One SQL `COPY` statement → `/mnt/documents/`                                  |
| Partner data feed                                  | Postgres logical replication, or scheduled snapshot to S3                     |
| New mobile app                                     | Reuse the same Lovable Cloud DB; same `lookupDupes` function                  |
| Search by ingredient                               | Add `ingredients text[]` column + GIN index (one migration)                   |
| Price overlay                                      | Add `prices` table referencing `products(id)`; fill from a separate source    |

The **products** and **dupes** tables stay clean. App-specific concerns never pollute them.

---

## Performance targets

- `lookupDupes(brand, productName)`: **< 50ms** p95 (slug PK hit + indexed dupe scan)
- Full-text product search: **< 100ms** p95 on 80k products
- Tag filter ("dry skin + no fragrance"): **< 100ms** p95 (GIN indexes)
- Ingestion: **0% impact on user-facing reads** (writes are isolated to background worker)

---

## Rate-limit safety on the ingestion side

- Custom `User-Agent` identifying our app
- 1 req/sec default with ±200ms jitter
- Exponential backoff on 429/5xx
- Hard pause if 3 consecutive 429s
- Daily cap (configurable, default 20k requests/day)
- Resume from queue position on failure — never lose progress

---

## What I need from you to start

1. **Confirm "DB is the asset" approach** — you own the schema, can use it anywhere.
2. **Seed scope to start with**: top ~5,000 products (1.5 hr) before going for the full corpus this weekend? Or start the full corpus immediately?
3. Anything else you want stored per product right away (e.g. a free-text `notes` column reserved for your own annotations later)?

Approve and I'll switch to build mode and ship Phase 1 + 2.