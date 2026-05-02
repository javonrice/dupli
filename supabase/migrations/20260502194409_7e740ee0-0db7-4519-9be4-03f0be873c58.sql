SELECT cron.unschedule('drain-ingestion-queue');
SELECT cron.unschedule('drain-ingestion-queue-b');

SELECT cron.schedule(
  'drain-ingestion-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--3d55b040-136b-4811-8b02-aeca9f4b9d73.lovable.app/api/public/hooks/run-ingestion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'INGESTION_TOKEN' limit 1)
    ),
    body := '{"batch": 150}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'drain-ingestion-queue-b',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--3d55b040-136b-4811-8b02-aeca9f4b9d73.lovable.app/api/public/hooks/run-ingestion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'INGESTION_TOKEN' limit 1)
    ),
    body := '{"batch": 150}'::jsonb
  );
  $$
);