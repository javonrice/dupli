-- Helper that upserts the INGESTION_TOKEN into vault.secrets.
-- SECURITY DEFINER so it can be invoked via PostgREST (supabaseAdmin).
create or replace function public.set_ingestion_token_secret(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'INGESTION_TOKEN';
  if v_id is null then
    select vault.create_secret(p_token, 'INGESTION_TOKEN') into v_id;
  else
    perform vault.update_secret(v_id, p_token, 'INGESTION_TOKEN');
  end if;
  return v_id;
end;
$$;

revoke all on function public.set_ingestion_token_secret(text) from public, anon, authenticated;

-- Re-schedule drains with bigger batch + a second offset job for parallelism.
do $$
begin
  perform cron.unschedule('drain-ingestion-queue');
exception when others then null;
end$$;

do $$
begin
  perform cron.unschedule('drain-ingestion-queue-b');
exception when others then null;
end$$;

select cron.schedule(
  'drain-ingestion-queue',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://project--3d55b040-136b-4811-8b02-aeca9f4b9d73.lovable.app/api/public/hooks/run-ingestion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'INGESTION_TOKEN' limit 1)
    ),
    body := '{"batch": 100}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'drain-ingestion-queue-b',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://project--3d55b040-136b-4811-8b02-aeca9f4b9d73.lovable.app/api/public/hooks/run-ingestion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'INGESTION_TOKEN' limit 1)
    ),
    body := '{"batch": 100}'::jsonb
  );
  $cron$
);