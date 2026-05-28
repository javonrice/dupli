ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS ugc_video_url text,
  ADD COLUMN IF NOT EXISTS ugc_video_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS ugc_video_id text,
  ADD COLUMN IF NOT EXISTS ugc_video_error text,
  ADD COLUMN IF NOT EXISTS ugc_video_updated_at timestamptz;

CREATE POLICY "Users can update their own scans ugc"
ON public.scans
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);