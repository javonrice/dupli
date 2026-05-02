-- Products: canonical registry of every brand+product
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  image_url TEXT,
  source_url TEXT,
  ingredients_count INTEGER,
  free_from TEXT[] NOT NULL DEFAULT '{}',
  good_for TEXT[] NOT NULL DEFAULT '{}',
  contains TEXT[] NOT NULL DEFAULT '{}',
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(brand_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(product_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'C')
  ) STORED,
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_unique UNIQUE (brand_slug, product_slug)
);

CREATE INDEX idx_products_brand_lower ON public.products (lower(brand_name));
CREATE INDEX idx_products_search_vector ON public.products USING GIN (search_vector);
CREATE INDEX idx_products_free_from ON public.products USING GIN (free_from);
CREATE INDEX idx_products_good_for ON public.products USING GIN (good_for);
CREATE INDEX idx_products_category ON public.products (category);

-- Dupes: pair table linking originals to dupes
CREATE TABLE public.dupes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dupe_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  overall_match INTEGER NOT NULL,
  ingredient_match INTEGER,
  attribute_match INTEGER,
  shared_ingredients_count INTEGER,
  rationale TEXT,
  rank INTEGER,
  source TEXT NOT NULL DEFAULT 'skinsort',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dupes_pair_unique UNIQUE (original_product_id, dupe_product_id),
  CONSTRAINT dupes_no_self CHECK (original_product_id <> dupe_product_id),
  CONSTRAINT dupes_overall_range CHECK (overall_match BETWEEN 0 AND 100)
);

CREATE INDEX idx_dupes_original_match ON public.dupes (original_product_id, overall_match DESC);
CREATE INDEX idx_dupes_dupe_match ON public.dupes (dupe_product_id, overall_match DESC);
CREATE INDEX idx_dupes_overall_match ON public.dupes (overall_match DESC);

-- Ingestion queue: internal worker todo list
CREATE TABLE public.ingestion_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  product_slug TEXT,
  reason TEXT NOT NULL DEFAULT 'seed',
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT ingestion_queue_status_check CHECK (status IN ('pending','processing','done','failed'))
);

CREATE UNIQUE INDEX idx_ingestion_queue_pending_unique
  ON public.ingestion_queue (brand_slug, COALESCE(product_slug, ''))
  WHERE status = 'pending';

CREATE INDEX idx_ingestion_queue_pickup
  ON public.ingestion_queue (status, priority DESC, created_at);

-- updated_at trigger for products (uses existing public.set_updated_at)
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_queue ENABLE ROW LEVEL SECURITY;

-- products: any authenticated user can read; writes are service-role only (no policies = denied).
CREATE POLICY "Products readable by authenticated"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- dupes: any authenticated user can read; writes are service-role only.
CREATE POLICY "Dupes readable by authenticated"
  ON public.dupes
  FOR SELECT
  TO authenticated
  USING (true);

-- ingestion_queue: no policies — fully internal, only service role can touch it.
