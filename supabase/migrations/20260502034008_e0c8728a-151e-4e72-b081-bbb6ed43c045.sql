-- Reset stuck "processing" items back to pending
UPDATE public.ingestion_queue SET status = 'pending' WHERE status = 'processing';

-- Re-point the cron job to the production URL
SELECT cron.unschedule('drain-ingestion-queue');

SELECT cron.schedule(
  'drain-ingestion-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dupli.lovable.app/api/public/hooks/run-ingestion',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer CeV5N-JJR6OZufbROR6cwlzxwxt7t8ZA55n258b_6Eg"}'::jsonb,
    body := '{"batch":8}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);