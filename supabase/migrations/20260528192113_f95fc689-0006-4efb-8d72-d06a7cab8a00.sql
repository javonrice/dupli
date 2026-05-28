-- Create public storage bucket for cached product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on the bucket
CREATE POLICY "Product images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Only service role can write (server-side via supabaseAdmin)
CREATE POLICY "Service role can upload product images"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Service role can update product images"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'product-images');

-- Cached URL column on products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cached_image_url text;