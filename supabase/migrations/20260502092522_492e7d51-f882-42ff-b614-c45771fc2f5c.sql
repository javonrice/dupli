
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS variant_id integer,
  ADD COLUMN IF NOT EXISTS last_priced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.product_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  merchant text NOT NULL,
  url text NOT NULL,
  price_usd numeric(10,2),
  currency text NOT NULL DEFAULT 'USD',
  rank integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, merchant)
);

CREATE INDEX IF NOT EXISTS idx_product_vendors_product_id ON public.product_vendors(product_id);
CREATE INDEX IF NOT EXISTS idx_product_vendors_price ON public.product_vendors(product_id, price_usd);

ALTER TABLE public.product_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors readable by authenticated" ON public.product_vendors;
CREATE POLICY "Vendors readable by authenticated"
  ON public.product_vendors FOR SELECT TO authenticated
  USING (true);
