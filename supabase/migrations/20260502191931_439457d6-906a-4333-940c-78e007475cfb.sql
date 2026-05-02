create or replace function public.verify_ingestion_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault
stable
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'INGESTION_TOKEN_DB' and decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_ingestion_token(text) from public, anon, authenticated;
grant execute on function public.verify_ingestion_token(text) to service_role;