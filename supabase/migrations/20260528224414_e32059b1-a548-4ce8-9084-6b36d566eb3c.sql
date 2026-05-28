
-- 1. user_videos table
CREATE TABLE public.user_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  thumbnail_url text,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  original_brand text,
  original_name text,
  dupe_brand text,
  dupe_name text,
  pair_count integer NOT NULL DEFAULT 1,
  duration_sec numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_videos_user_created ON public.user_videos (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_videos TO authenticated;
GRANT ALL ON public.user_videos TO service_role;

ALTER TABLE public.user_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own videos" ON public.user_videos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own videos" ON public.user_videos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own videos" ON public.user_videos
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own videos" ON public.user_videos
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Storage bucket (private, owner-scoped by first folder = user_id)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-videos', 'user-videos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own video files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own video files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own video files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'user-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
