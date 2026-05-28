CREATE TABLE public.dashboard_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dupe_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.dashboard_generations TO service_role;

ALTER TABLE public.dashboard_generations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dashboard_gen_recent ON public.dashboard_generations (created_at DESC);