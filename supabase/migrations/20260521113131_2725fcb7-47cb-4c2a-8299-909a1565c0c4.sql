ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dupes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products readable by anon" ON public.products
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Dupes readable by anon" ON public.dupes
  FOR SELECT TO anon, authenticated USING (true);