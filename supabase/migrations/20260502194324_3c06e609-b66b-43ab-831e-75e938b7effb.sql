-- Update verify function to accept either vault token name, and rewrite vault entry from the function arg path.
-- We can't read process.env from SQL, so instead we make verify_ingestion_token check BOTH names,
-- and we'll bootstrap INGESTION_TOKEN_DB from the worker via a one-time call.

CREATE OR REPLACE FUNCTION public.verify_ingestion_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name in ('INGESTION_TOKEN_DB', 'INGESTION_TOKEN')
      and decrypted_secret = p_token
  );
$$;

-- Also expose a setter for INGESTION_TOKEN_DB so the worker can bootstrap it.
CREATE OR REPLACE FUNCTION public.set_ingestion_token_db_secret(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'INGESTION_TOKEN_DB';
  if v_id is null then
    select vault.create_secret(p_token, 'INGESTION_TOKEN_DB') into v_id;
  else
    perform vault.update_secret(v_id, p_token, 'INGESTION_TOKEN_DB');
  end if;
  return v_id;
end;
$$;

-- Lock down: only service_role can call the setter.
REVOKE ALL ON FUNCTION public.set_ingestion_token_db_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ingestion_token_db_secret(text) TO service_role;