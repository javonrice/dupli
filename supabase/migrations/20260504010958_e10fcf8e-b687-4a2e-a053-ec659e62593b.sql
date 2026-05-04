CREATE TABLE public.product_link_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL,
  product_slug text NOT NULL,
  vendors jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'web-search',
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_slug, product_slug)
);

CREATE INDEX idx_product_link_cache_lookup
  ON public.product_link_cache (brand_slug, product_slug);

ALTER TABLE public.product_link_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Link cache readable by authenticated"
  ON public.product_link_cache
  FOR SELECT
  TO authenticated
  USING (true);