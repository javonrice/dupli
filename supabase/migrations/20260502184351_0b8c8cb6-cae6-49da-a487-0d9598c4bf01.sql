-- Unique vendor row per (product, merchant) so upserts overwrite stale prices
ALTER TABLE public.product_vendors
  ADD CONSTRAINT product_vendors_product_merchant_unique
  UNIQUE (product_id, merchant);

CREATE INDEX IF NOT EXISTS product_vendors_product_id_idx
  ON public.product_vendors (product_id);

-- Denormalized lowest price for fast display / sort
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS lowest_price_usd numeric;

CREATE INDEX IF NOT EXISTS products_lowest_price_usd_idx
  ON public.products (lowest_price_usd)
  WHERE lowest_price_usd IS NOT NULL;