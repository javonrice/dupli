ALTER TABLE public.ingestion_queue
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS product_id uuid;

CREATE INDEX IF NOT EXISTS ingestion_queue_pending_idx
  ON public.ingestion_queue (priority DESC, created_at ASC)
  WHERE status = 'pending';